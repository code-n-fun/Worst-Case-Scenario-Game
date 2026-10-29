begin;
create or replace function public.message_react(p_scope text,p_message bigint,p_emoji text) returns void
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();m chat_messages%rowtype;d direct_messages%rowtype;code text;
begin
 if uid is null then raise exception 'Guest sign-in required.';end if;
 if p_emoji is null or p_emoji not in ('👍','❤️','😂','🔥','👏','😮','🫡','👀') then raise exception 'Choose an available reaction.';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if p_scope='public' then
  select * into m from chat_messages where id=p_message;
  if m.id is null or exists(select 1 from chat_blocks where user_id=uid and blocked_user_id=m.user_id) then raise exception 'Message not accessible.';end if;
  if m.room_id is not null then
   select r.code into code from rooms r where r.id=m.room_id and r.expires_at>now() and r.phase not in ('prompt','writing','voting')
    and exists(select 1 from players where room_id=r.id and user_id=uid and active);
   if code is null then raise exception 'Room reactions are available between rounds.';end if;
  end if;
 elsif p_scope='direct' then
  select * into d from direct_messages where id=p_message and (sender_id=uid or recipient_id=uid);
  if d.id is null or exists(select 1 from chat_blocks where (user_id=uid and blocked_user_id=case when d.sender_id=uid then d.recipient_id else d.sender_id end) or (blocked_user_id=uid and user_id=case when d.sender_id=uid then d.recipient_id else d.sender_id end)) then raise exception 'Message not accessible.';end if;
 else raise exception 'Unknown message channel.';end if;
 if exists(select 1 from message_reactions where scope=p_scope and message_id=p_message and user_id=uid and emoji=p_emoji) then
  delete from message_reactions where scope=p_scope and message_id=p_message and user_id=uid and emoji=p_emoji;
 else insert into message_reactions values(p_scope,p_message,uid,p_emoji);end if;
 if p_scope='direct' then
  perform realtime.send('{}'::jsonb,'direct_changed','person:'||d.sender_id,true);
  perform realtime.send('{}'::jsonb,'direct_changed','person:'||d.recipient_id,true);
 else perform realtime.send('{}'::jsonb,'chat_changed',case when code is null then 'community:lounge' else 'room:'||code end,true);end if;
end;$$;
revoke all on function public.message_react(text,bigint,text) from public;
grant execute on function public.message_react(text,bigint,text) to authenticated;
commit;
