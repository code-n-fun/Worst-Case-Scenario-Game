begin;
create or replace function public.message_reaction_list(p_scope text,p_message bigint) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
  select emoji,count(*)::int count,bool_or(user_id=auth.uid()) mine from message_reactions r
  where scope=p_scope and message_id=p_message and not exists(select 1 from chat_blocks b where b.user_id=auth.uid() and b.blocked_user_id=r.user_id)
  group by emoji order by emoji
 )x;
$$;
revoke all on function public.message_reaction_list(text,bigint) from public,anon,authenticated;
create or replace function public.direct_read(p_peer uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Guest sign-in required.';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from (
  select m.id,m.sender_id,coalesce((select nickname from community_profiles where user_id=m.sender_id),(select nickname from players where user_id=m.sender_id order by last_seen desc limit 1),'Player') nickname,
   m.body,m.created_at,message_reaction_list('direct',m.id) reactions,
   (select jsonb_build_object('id',parent.id,'body',parent.body) from direct_messages parent where parent.id=m.reply_to
    and not exists(select 1 from chat_blocks where user_id=uid and blocked_user_id=parent.sender_id)) reply
  from direct_messages m where ((m.sender_id=uid and m.recipient_id=p_peer) or (m.sender_id=p_peer and m.recipient_id=uid))
   and not exists(select 1 from chat_blocks where user_id=uid and blocked_user_id=m.sender_id)
  order by m.id desc limit 100
 )x;return result;
end;$$;
create or replace function public.direct_mark_read(p_peer uuid,p_latest bigint) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Guest sign-in required.';end if;
 if not exists(select 1 from direct_messages where id=p_latest and ((sender_id=auth.uid() and recipient_id=p_peer) or (recipient_id=auth.uid() and sender_id=p_peer))) then return;end if;
 insert into direct_reads values(auth.uid(),p_peer,p_latest) on conflict(user_id,peer_id) do update set last_read=greatest(direct_reads.last_read,excluded.last_read);
end;$$;
revoke all on function public.direct_read(uuid),public.direct_mark_read(uuid,bigint) from public;
grant execute on function public.direct_read(uuid),public.direct_mark_read(uuid,bigint) to authenticated;
commit;
