begin;
create or replace function public.direct_send(p_peer uuid,p_body text,p_reply bigint default null) returns bigint
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();mid bigint;
begin
 if uid is null or p_peer is null or uid=p_peer then raise exception 'Choose another player.';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if p_body is null or char_length(trim(p_body)) not between 1 and 300 then raise exception 'Write a message (up to 300 characters).';end if;
 if not exists(select 1 from community_profiles where user_id=p_peer) and not exists(select 1 from players where user_id=p_peer) then raise exception 'Player not found.';end if;
 if exists(select 1 from chat_blocks where (user_id=uid and blocked_user_id=p_peer) or (user_id=p_peer and blocked_user_id=uid)) then raise exception 'Messaging is unavailable for this player.';end if;
 if exists(select 1 from direct_messages where sender_id=uid and created_at>clock_timestamp()-interval '2 seconds') or (select count(*) from direct_messages where sender_id=uid and created_at>now()-interval '1 minute')>=15 then raise exception 'Please slow down before sending another message.';end if;
 if p_reply is not null and not exists(select 1 from direct_messages where id=p_reply and ((sender_id=uid and recipient_id=p_peer) or (sender_id=p_peer and recipient_id=uid))) then raise exception 'Reply must belong to this conversation.';end if;
 insert into direct_messages(sender_id,recipient_id,body,reply_to) values(uid,p_peer,trim(p_body),p_reply) returning id into mid;
 perform realtime.send('{}'::jsonb,'direct_changed','person:'||p_peer,true);
 perform realtime.send('{}'::jsonb,'direct_changed','person:'||uid,true);
 return mid;
end;$$;
revoke all on function public.direct_send(uuid,text,bigint) from public;
grant execute on function public.direct_send(uuid,text,bigint) to authenticated;
commit;
