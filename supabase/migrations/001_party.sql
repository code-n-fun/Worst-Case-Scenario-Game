-- Run once in the Supabase SQL editor. Enable Auth > Anonymous sign-ins.
create table public.rooms (
 id uuid primary key default gen_random_uuid(), code text unique not null,
 host uuid not null, phase text not null default 'lobby', version bigint not null default 0,
 round integer not null default 0, total_rounds integer not null default 5,
 deadline timestamptz, scenario text not null default '', created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '6 hours'
);
create table public.players (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms on delete cascade,
 user_id uuid not null, nickname text not null check(char_length(nickname) between 1 and 20),
 joined_at timestamptz not null default now(), last_seen timestamptz not null default now(),
 active boolean not null default true, eligible_round integer not null default 1,
 unique(room_id,user_id), unique(room_id,nickname)
);
create table public.rounds (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms on delete cascade,
 number integer not null, scenario text not null, unique(room_id,number)
);
create table public.round_players (
 round_id uuid references public.rounds on delete cascade, player_id uuid references public.players on delete cascade,
 items jsonb not null, primary key(round_id,player_id)
);
create table public.submissions (
 id uuid primary key default gen_random_uuid(), round_id uuid not null references public.rounds on delete cascade,
 player_id uuid not null references public.players on delete cascade,
 text text not null check(char_length(text) between 1 and 500), display_order float not null default random(),
 unique(round_id,player_id)
);
create table public.votes (
 round_id uuid references public.rounds on delete cascade, voter_id uuid references public.players on delete cascade,
 submission_id uuid not null references public.submissions on delete cascade, primary key(round_id,voter_id)
);
create table public.score_events (
 round_id uuid references public.rounds on delete cascade, player_id uuid references public.players on delete cascade,
 points integer not null, primary key(round_id,player_id)
);
-- No raw client reads: all player-specific projections pass through party_action.
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_players enable row level security;
alter table public.submissions enable row level security;
alter table public.votes enable row level security;
alter table public.score_events enable row level security;
revoke all on public.rooms,public.players,public.rounds,public.round_players,public.submissions,public.votes,public.score_events from anon,authenticated;

create function public.party_member(topic text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from rooms r join players p on p.room_id=r.id where 'room:'||r.code=topic and p.user_id=auth.uid() and p.active and r.expires_at>now());
$$;
revoke all on function public.party_member(text) from public;
grant execute on function public.party_member(text) to authenticated;
create policy party_receive on realtime.messages for select to authenticated using (public.party_member(realtime.topic()));

create function public.party_action(p_action text,p_code text default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 uid uuid:=auth.uid(); r rooms%rowtype; me players%rowtype; rid uuid; candidate text;
 nick text:=trim(coalesce(p_payload->>'nickname','')); alphabet text:='ABCDEFGHJKLMNPQRSTUVWXYZ';
 n integer; expected integer; done integer; changed boolean:=false; choice uuid; data jsonb;
 prompt_list text[]:=array[
 'You’re stuck in a broken elevator with a very angry goose.',
 'Aliens have landed. They think you’re the person in charge.',
 'Your first day as a pirate. Unfortunately, you get seasick.',
 'Every pigeon in the city has decided you’re their leader.',
 'You accidentally challenged a wizard to a dance battle.',
 'Your camping trip is interrupted by a bear asking for directions.',
 'You’re the only human at a robot wedding. It’s your turn to give a toast.',
 'Gravity stops working every time you sneeze.',
 'A dragon has moved into your apartment and refuses to pay rent.',
 'You’re on a cooking show, but all the judges are raccoons.',
 'The floor is actually lava. Your delivery just arrived.',
 'You’ve been hired to babysit an invisible dinosaur.'];
 item_list text[]:=array['A raw steak','A roll of duct tape','A trombone','One rubber duck','A warm potato','A glitter cannon','An inflatable sofa','A tiny umbrella','A jar of pickles','A kazoo','Roller skates','A very long scarf','Marshmallows','A novelty mustache','A traffic cone','A disco ball','A garden gnome','One oven mitt','A leaf blower','A squeaky hammer','A pool noodle','A box of crayons','A banana peel','A polite megaphone'];
begin
 if uid is null then raise exception 'Guest sign-in required.'; end if;
 if p_action not in ('create','join','snapshot','start','submit','vote','next','tick','heartbeat','leave') then raise exception 'Unknown game action.'; end if;
 -- Serialize creates/joins per identity; room row lock serializes all room mutations.
 if p_action in ('create','join') then perform pg_advisory_xact_lock(hashtext(uid::text)); end if;
 if p_action='create' then
  if char_length(nick) not between 1 and 20 then raise exception 'Nickname must be 1–20 characters.'; end if;
  if (select count(*) from rooms where host=uid and created_at>now()-interval '1 hour')>=10 then raise exception 'Too many rooms. Try again later.'; end if;
  for n in 1..30 loop
   candidate:='';for expected in 1..4 loop candidate:=candidate||substr(alphabet,1+floor(random()*length(alphabet))::int,1);end loop;
   insert into rooms(code,host) values(candidate,uid) on conflict(code) do nothing returning * into r;
   exit when r.id is not null;
  end loop;
  if r.id is null then raise exception 'Could not allocate a room. Please retry.';end if;
  insert into players(room_id,user_id,nickname) values(r.id,uid,nick) returning * into me;
  changed:=true;
 else
  select * into r from rooms where code=upper(trim(p_code)) for update;
  if r.id is null or r.expires_at<=now() then raise exception 'Room not found or expired.';end if;
  select * into me from players where room_id=r.id and user_id=uid;
  if p_action='join' then
   if me.id is null or not me.active then
    if (select count(*) from players where room_id=r.id and active)>=8 then raise exception 'This room is full (8 players).';end if;
    if me.id is null then
     if char_length(nick) not between 1 and 20 then raise exception 'Enter a nickname (1–20 characters).';end if;
     if exists(select 1 from players where room_id=r.id and lower(nickname)=lower(nick)) then raise exception 'That nickname is already in use.';end if;
     insert into players(room_id,user_id,nickname,eligible_round) values(r.id,uid,nick,case when r.phase='lobby' then 1 else r.round+1 end) returning * into me;
    else update players set active=true,last_seen=now(),eligible_round=case when r.phase='lobby' then 1 else r.round+1 end where id=me.id returning * into me;
    end if;
    changed:=true;
   end if;
  end if;
  if me.id is null or not me.active then raise exception 'Join this room first.';end if;
 end if;
 -- Heartbeat is durable; Presence is never used to decide scoring.
 if me.last_seen<now()-interval '10 seconds' then update players set last_seen=now() where id=me.id;changed:=true;end if;
 if not exists(select 1 from players where room_id=r.id and user_id=r.host and active and last_seen>now()-interval '45 seconds') then
  select user_id into r.host from players where room_id=r.id and active and last_seen>now()-interval '45 seconds' order by joined_at limit 1;
  r.host:=coalesce(r.host,uid);changed:=true;
 end if;
 select id into rid from rounds where room_id=r.id and number=r.round;
 -- Deadlines advance using the recorded deadline, not the checking client's clock.
 if r.phase='prompt' and r.deadline<=now() then r.phase:='writing';r.deadline:=r.deadline+interval '90 seconds';changed:=true;end if;
 if r.phase='writing' and r.deadline<=now() then r.phase:='voting';r.deadline:=r.deadline+interval '30 seconds';changed:=true;end if;
 if p_action in ('start','next') then
  if uid<>r.host then raise exception 'Only the host can advance the game.';end if;
  if not ((p_action='start' and r.phase='lobby') or (p_action='next' and r.phase in ('results','finished'))) then raise exception 'This phase cannot be advanced.';end if;
  if r.phase='finished' then
   delete from rounds where room_id=r.id; r.round:=0;r.phase:='lobby';r.deadline:=null;
   update players set eligible_round=1 where room_id=r.id;
  elsif r.round>=r.total_rounds then r.phase:='finished';r.deadline:=null;
  else
   if (select count(*) from players where room_id=r.id and active and last_seen>now()-interval '45 seconds')<2 then raise exception 'At least two connected players are needed.';end if;
   r.round:=r.round+1;r.phase:='prompt';r.deadline:=now()+interval '5 seconds';
   select s into r.scenario from unnest(prompt_list) s where s not in (select scenario from rounds where room_id=r.id) order by random() limit 1;
   insert into rounds(room_id,number,scenario) values(r.id,r.round,r.scenario) returning id into rid;
   insert into round_players(round_id,player_id,items)
    select rid,p.id,(select jsonb_agg(t.item) from (select item from unnest(item_list) item order by random()+length(p.id::text)*0 limit 3)t)
    from players p where p.room_id=r.id and p.active and p.eligible_round<=r.round;
  end if; changed:=true;
 end if;
 if p_action='submit' then
  if r.phase<>'writing' then raise exception 'Writing is closed.';end if;
  if not exists(select 1 from round_players where round_id=rid and player_id=me.id) then raise exception 'You will join next round.';end if;
  if char_length(trim(coalesce(p_payload->>'text',''))) not between 1 and 500 then raise exception 'Plan must be 1–500 characters.';end if;
  insert into submissions(round_id,player_id,text) values(rid,me.id,trim(p_payload->>'text')) on conflict(round_id,player_id) do nothing;changed:=true;
 end if;
 if r.phase='writing' then
  select count(*) into expected from round_players where round_id=rid;
  select count(*) into done from submissions where round_id=rid;
  if done>=expected and expected>0 then r.phase:='voting';r.deadline:=now()+interval '30 seconds';changed:=true;end if;
 end if;
 if p_action='vote' then
  if r.phase<>'voting' or r.deadline<=now() then raise exception 'Voting is closed.';end if;
  if not exists(select 1 from round_players where round_id=rid and player_id=me.id) then raise exception 'You will join next round.';end if;
  choice:=(p_payload->>'id')::uuid;
  if not exists(select 1 from submissions where id=choice and round_id=rid and player_id<>me.id) then raise exception 'Choose another player’s plan.';end if;
  insert into votes values(rid,me.id,choice) on conflict(round_id,voter_id) do nothing;changed:=true;
 end if;
 if r.phase='voting' then
  select count(*) into expected from round_players rp where rp.round_id=rid and exists(select 1 from submissions s where s.round_id=rid and s.player_id<>rp.player_id);
  select count(*) into done from votes where round_id=rid;
  if r.deadline<=now() or done>=expected then
   insert into score_events select rid,s.player_id,count(v.submission_id)::int from submissions s left join votes v on v.submission_id=s.id where s.round_id=rid group by s.player_id on conflict do nothing;
   r.phase:='results';r.deadline:=null;changed:=true;
  end if;
 end if;
 if p_action='leave' then update players set active=false where id=me.id;changed:=true;
  if r.host=uid then select user_id into r.host from players where room_id=r.id and active order by joined_at limit 1;r.host:=coalesce(r.host,uid);end if;
 end if;
 if changed then
  r.version:=r.version+1;
  update rooms set host=r.host,phase=r.phase,round=r.round,deadline=r.deadline,scenario=r.scenario,version=r.version where id=r.id;
  perform realtime.send(jsonb_build_object('version',r.version),'changed','room:'||r.code,true);
 end if;
 if p_action='leave' then return null;end if;
 select jsonb_build_object(
  'serverTime',extract(epoch from clock_timestamp())*1000,'code',r.code,'phase',r.phase,'version',r.version,'round',r.round,'totalRounds',r.total_rounds,'host',r.host,'me',uid,
  'deadline',extract(epoch from r.deadline)*1000,'scenario',r.scenario,
  'items',coalesce((select items from round_players where round_id=rid and player_id=me.id),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'score',coalesce((select sum(points) from score_events where player_id=p.id),0),'connected',p.active and p.last_seen>now()-interval '45 seconds','host',p.user_id=r.host) order by p.joined_at) from players p where p.room_id=r.id and (p.active or exists(select 1 from score_events where player_id=p.id))),'[]'::jsonb),
  'submitted',exists(select 1 from submissions where round_id=rid and player_id=me.id),
  'submittedCount',(select count(*) from submissions where round_id=rid),
  'voted',exists(select 1 from votes where round_id=rid and voter_id=me.id),
  'votedCount',(select count(*) from votes where round_id=rid),
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'text',s.text,'mine',s.player_id=me.id)||case when r.phase in ('results','finished') then jsonb_build_object('author',p.nickname,'votes',(select count(*) from votes where submission_id=s.id)) else '{}'::jsonb end order by s.display_order) from submissions s join players p on p.id=s.player_id where s.round_id=rid and (r.phase in ('voting','results','finished') or s.player_id=me.id)),'[]'::jsonb)
 ) into data;
 return data;
end;
$$;
revoke all on function public.party_action(text,text,jsonb) from public;
grant execute on function public.party_action(text,text,jsonb) to authenticated;
-- Optional daily maintenance via Supabase Cron: delete from public.rooms where expires_at < now();

-- Persistent per-identity throttling survives failed room-code attempts.
create table public.party_rate_limits(user_id uuid primary key, window_start timestamptz not null, requests integer not null);
alter table public.party_rate_limits enable row level security;
revoke all on public.party_rate_limits from anon,authenticated;
alter function public.party_action(text,text,jsonb) rename to party_action_internal;
revoke all on function public.party_action_internal(text,text,jsonb) from authenticated;
create function public.party_action(p_action text,p_code text default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare hits integer;uid uuid:=auth.uid();
begin
 if uid is null then return jsonb_build_object('error','Guest sign-in required.');end if;
 insert into party_rate_limits values(uid,now(),1) on conflict(user_id) do update set
  requests=case when party_rate_limits.window_start<now()-interval '1 minute' then 1 else party_rate_limits.requests+1 end,
  window_start=case when party_rate_limits.window_start<now()-interval '1 minute' then now() else party_rate_limits.window_start end returning requests into hits;
 if hits>180 then return jsonb_build_object('error','Too many requests. Please wait a minute.');end if;
 begin return party_action_internal(p_action,p_code,p_payload);
 exception when others then return jsonb_build_object('error',sqlerrm);end;
end;
$$;
revoke all on function public.party_action(text,text,jsonb) from public;
grant execute on function public.party_action(text,text,jsonb) to authenticated;
-- Anonymous sign-in endpoint abuse is controlled separately through Supabase Auth rate limits/CAPTCHA.
