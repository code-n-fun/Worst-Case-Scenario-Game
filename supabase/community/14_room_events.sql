begin;
create table if not exists public.room_events (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.rooms on delete cascade,
 kind text not null check(kind in ('player_left','room_closed')),
 nickname text not null, user_id uuid not null, created_at timestamptz not null default now()
);
create index if not exists room_events_recent on public.room_events(room_id,id desc);
create unique index if not exists room_closed_once on public.room_events(room_id) where kind='room_closed';
alter table public.room_events enable row level security;
revoke all on public.room_events from anon,authenticated;
create or replace function public.record_room_event(p_room uuid,p_kind text,p_user uuid,p_nickname text)
returns void language plpgsql security definer set search_path=public as $$
declare msg jsonb; eid bigint; code text;
begin
 insert into room_events(room_id,kind,user_id,nickname) values(p_room,p_kind,p_user,p_nickname)
 on conflict do nothing returning id into eid;
 if eid is null then return;end if;
 select r.code into code from rooms r where r.id=p_room;
 msg:=jsonb_build_object('id',eid,'kind',p_kind,'user_id',p_user,'nickname',p_nickname);
 perform realtime.send(msg,'room_notice','room:'||code,true);
end;$$;
create or replace function public.close_party_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare owner_player players%rowtype;
begin
 perform 1 from rooms where id=p_room for update;
 select * into owner_player from players where room_id=p_room order by joined_at,id limit 1;
 perform record_room_event(p_room,'room_closed',owner_player.user_id,owner_player.nickname);
 update rooms set expires_at=least(expires_at,now()),is_public=false,version=version+1 where id=p_room and expires_at>now();
end;$$;
create or replace function public.player_departure_notice() returns trigger
language plpgsql security definer set search_path=public as $$
declare creator uuid;
begin
 if old.active and not new.active then
  select user_id into creator from players where room_id=new.room_id order by joined_at,id limit 1;
  if new.user_id=creator then perform close_party_room(new.room_id);
  else perform record_room_event(new.room_id,'player_left',new.user_id,new.nickname);end if;
 end if;
 return new;
end;$$;
revoke all on function public.record_room_event(uuid,text,uuid,text),public.close_party_room(uuid),public.player_departure_notice() from public,anon,authenticated;
drop trigger if exists player_departure on public.players;
create trigger player_departure after update of active on public.players for each row execute function public.player_departure_notice();
commit;
