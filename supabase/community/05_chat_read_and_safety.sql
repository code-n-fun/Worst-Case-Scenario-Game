begin;
create or replace function public.chat_read(p_room_code text default null,p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path=public as $$
declare rid uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in as a guest first.';end if;
 if p_room_code is not null then
  select id into rid from rooms where code=upper(trim(p_room_code)) and expires_at>now();
  if rid is null or not exists(select 1 from players where room_id=rid and user_id=auth.uid() and active) then raise exception 'Join this room first.';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from (
  select m.id,m.user_id as sender_id,m.nickname,m.body,m.created_at,
   case when exists(select 1 from rooms r where r.code=m.invite_code and r.expires_at>now() and (r.is_public or exists(select 1 from players p where p.room_id=r.id and p.user_id=auth.uid() and p.active))) then m.invite_code end as invite_code
  from chat_messages m where m.room_id is not distinct from rid and m.id>coalesce(p_after,0)
   and not exists(select 1 from chat_blocks b where b.user_id=auth.uid() and b.blocked_user_id=m.user_id)
  order by m.id desc limit 50
 )x;return result;
end;$$;
create or replace function public.chat_block(p_user uuid,p_block boolean default true) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_user is null or p_user=auth.uid() then raise exception 'Choose another player.';end if;
 if p_block then insert into chat_blocks values(auth.uid(),p_user) on conflict do nothing;
 else delete from chat_blocks where user_id=auth.uid() and blocked_user_id=p_user;end if;
end;$$;
create or replace function public.chat_report(p_message bigint,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare m chat_messages%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in as a guest first.';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 300 then raise exception 'Provide a reason (1-300 characters).';end if;
 select * into m from chat_messages where id=p_message;
 if m.id is null or (m.room_id is not null and not exists(select 1 from players where room_id=m.room_id and user_id=auth.uid() and active)) then raise exception 'Message is not accessible.';end if;
 insert into chat_reports(user_id,message_id,reason) values(auth.uid(),p_message,trim(p_reason)) on conflict do nothing;
end;$$;
revoke all on function public.chat_read(text,bigint),public.chat_block(uuid,boolean),public.chat_report(bigint,text) from public;
grant execute on function public.chat_read(text,bigint),public.chat_block(uuid,boolean),public.chat_report(bigint,text) to authenticated;
commit;
