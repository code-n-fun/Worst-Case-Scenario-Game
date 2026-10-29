begin;
create or replace function public.chat_send(p_body text,p_room_code text default null,p_invite_code text default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();rid uuid; nick text; msg bigint; invited rooms%rowtype;
begin
 if uid is null then raise exception 'Sign in as a guest first.';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if char_length(trim(p_body)) not between 1 and 300 or p_body is null then raise exception 'Message must be 1-300 characters.';end if;
 if exists(select 1 from chat_messages where user_id=uid and created_at>clock_timestamp()-interval '2 seconds') then raise exception 'Please wait two seconds between messages.';end if;
 if (select count(*) from chat_messages where user_id=uid and created_at>now()-interval '1 minute')>=15 then raise exception 'Message limit reached. Wait a minute.';end if;
 select nickname into nick from community_profiles where user_id=uid;
 if p_room_code is not null then
  select id into rid from rooms where code=upper(trim(p_room_code)) and expires_at>now() for update;
  if rid is null or not exists(select 1 from players where room_id=rid and user_id=uid and active) then raise exception 'Join this room before chatting.';end if;
  if exists(select 1 from rooms where id=rid and phase in ('prompt','writing','voting')) then raise exception 'Room chat reopens after the round.';end if;
  select nickname into nick from players where room_id=rid and user_id=uid;
 end if;
 if nick is null then raise exception 'Choose a nickname first.';end if;
 if p_invite_code is not null then
  select * into invited from rooms where code=upper(trim(p_invite_code)) and expires_at>now();
  if invited.id is null or not exists(select 1 from players where room_id=invited.id and user_id=uid and active) then raise exception 'You can only share rooms you belong to.';end if;
  if rid is null and not invited.is_public then raise exception 'Make the room public before sharing it in the public lounge.';end if;
 end if;
 insert into chat_messages(room_id,user_id,nickname,body,invite_code)
 values(rid,uid,nick,trim(p_body),case when p_invite_code is not null then invited.code end) returning id into msg;
 -- Broadcast only an invalidation; clients fetch authorized message projections.
 perform realtime.send('{}'::jsonb,'chat_changed',case when rid is null then 'community:lounge' else 'room:'||upper(trim(p_room_code)) end,true);
 return msg;
end;$$;
revoke all on function public.chat_send(text,text,text) from public;
grant execute on function public.chat_send(text,text,text) to authenticated;
drop policy if exists community_lounge_receive on realtime.messages;
create policy community_lounge_receive on realtime.messages for select to authenticated
 using (realtime.topic()='community:lounge');
commit;
