begin;
create or replace function public.chat_reply(p_body text,p_room_code text default null,p_invite_code text default null,p_reply bigint default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare rid uuid;mid bigint;
begin
 if p_room_code is not null then select id into rid from rooms where code=upper(trim(p_room_code)) and expires_at>now();end if;
 if p_reply is not null and not exists(select 1 from chat_messages m where m.id=p_reply and m.room_id is not distinct from rid
  and not exists(select 1 from chat_blocks b where b.user_id=auth.uid() and b.blocked_user_id=m.user_id)) then raise exception 'Reply must belong to this channel.';end if;
 mid:=chat_send(p_body,p_room_code,p_invite_code);
 update chat_messages set reply_to=p_reply where id=mid;
 return mid;
end;$$;
create or replace function public.chat_read(p_room_code text default null,p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path=public as $$
declare rid uuid;result jsonb;
begin
 if auth.uid() is null then raise exception 'Guest sign-in required.';end if;
 if p_room_code is not null then
  select id into rid from rooms where code=upper(trim(p_room_code)) and expires_at>now();
  if rid is null or not exists(select 1 from players where room_id=rid and user_id=auth.uid() and active) then raise exception 'Join this room first.';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from (
  select m.id,m.user_id sender_id,m.nickname,m.body,m.created_at,
   case when exists(select 1 from rooms r where r.code=m.invite_code and r.expires_at>now() and (r.is_public or exists(select 1 from players p where p.room_id=r.id and p.user_id=auth.uid() and p.active))) then m.invite_code end invite_code,
   message_reaction_list('public',m.id) reactions,
   (select jsonb_build_object('id',q.id,'body',q.body) from chat_messages q where q.id=m.reply_to and q.room_id is not distinct from m.room_id
    and not exists(select 1 from chat_blocks where user_id=auth.uid() and blocked_user_id=q.user_id)) reply
  from chat_messages m where m.room_id is not distinct from rid and m.id>coalesce(p_after,0)
   and not exists(select 1 from chat_blocks b where b.user_id=auth.uid() and b.blocked_user_id=m.user_id)
  order by m.id desc limit 50
 )x;return result;
end;$$;
revoke all on function public.chat_reply(text,text,text,bigint),public.chat_read(text,bigint) from public;
grant execute on function public.chat_reply(text,text,text,bigint),public.chat_read(text,bigint) to authenticated;
commit;
