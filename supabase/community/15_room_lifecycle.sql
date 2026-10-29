begin;
create or replace function public.room_lifecycle(p_action text,p_code text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype; creator players%rowtype; result jsonb; events jsonb; uid uuid:=auth.uid();
begin
 if uid is null then return jsonb_build_object('error','Guest sign-in required.');end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if p_action<>'create' then
  select * into r from rooms where code=upper(trim(p_code)) for update;
  if r.id is not null then
   select * into creator from players where room_id=r.id order by joined_at,id limit 1;
   if r.expires_at<=now() then
    return jsonb_build_object('error','This room is closed. Please join another room.','code','ROOM_CLOSED');
   end if;
   if not creator.active or creator.last_seen<=now()-interval '45 seconds' then
    perform close_party_room(r.id);
    return jsonb_build_object('error','The room creator has left. This room is now closed.','code','ROOM_CLOSED');
   end if;
   update players set active=false where room_id=r.id and active and user_id<>creator.user_id
    and user_id<>uid and last_seen<=now()-interval '45 seconds';
  end if;
 end if;
 result:=community_snapshot(party_action_internal(p_action,p_code,p_payload));
 if result is null or result ? 'error' then return result;end if;
 select id into r.id from rooms where code=result->>'code';
 select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) into events from
  (select id,kind,nickname,user_id from room_events where room_id=r.id order by id desc limit 100)e;
 return result||jsonb_build_object('roomEvents',events);
end;$$;
revoke all on function public.room_lifecycle(text,text,jsonb) from public,anon,authenticated;
-- Keep the existing throttle, and apply lifecycle checks before the original engine.
create or replace function public.party_action(p_action text,p_code text default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare hits integer;uid uuid:=auth.uid();
begin
 if uid is null then return jsonb_build_object('error','Guest sign-in required.');end if;
 insert into party_rate_limits values(uid,now(),1) on conflict(user_id) do update set
  requests=case when party_rate_limits.window_start<now()-interval '1 minute' then 1 else party_rate_limits.requests+1 end,
  window_start=case when party_rate_limits.window_start<now()-interval '1 minute' then now() else party_rate_limits.window_start end returning requests into hits;
 if hits>180 then return jsonb_build_object('error','Too many requests. Please wait a minute.');end if;
 begin return room_lifecycle(p_action,p_code,p_payload);
 exception when others then return jsonb_build_object('error',sqlerrm);end;
end;$$;
revoke all on function public.party_action(text,text,jsonb) from public;
grant execute on function public.party_action(text,text,jsonb) to authenticated;
commit;
