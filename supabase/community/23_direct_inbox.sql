begin;
create or replace function public.direct_inbox() returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Guest sign-in required.';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.latest_id desc),'[]'::jsonb) into result from (
  select peer.id,coalesce((select nickname from community_profiles where user_id=peer.id),(select nickname from players where user_id=peer.id order by last_seen desc limit 1),'Player') nickname,
   max(m.id) latest_id,(array_agg(m.body order by m.id desc))[1] preview,
   count(*) filter(where m.recipient_id=uid and m.id>coalesce((select last_read from direct_reads where user_id=uid and peer_id=peer.id),0))::int unread
  from direct_messages m cross join lateral (select case when m.sender_id=uid then m.recipient_id else m.sender_id end id)peer
  where (m.sender_id=uid or m.recipient_id=uid) and not exists(select 1 from chat_blocks where user_id=uid and blocked_user_id=peer.id)
  group by peer.id order by max(m.id) desc limit 100
 )x;return result;
end;$$;
create or replace function public.direct_report(p_message bigint,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from direct_messages where id=p_message and (sender_id=auth.uid() or recipient_id=auth.uid())) then raise exception 'Message not accessible.';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 300 then raise exception 'Provide a reason (up to 300 characters).';end if;
 insert into direct_reports values(auth.uid(),p_message,trim(p_reason)) on conflict do nothing;
end;$$;
revoke all on function public.direct_inbox(),public.direct_report(bigint,text) from public;
grant execute on function public.direct_inbox(),public.direct_report(bigint,text) to authenticated;
commit;
