begin;
create or replace function public.lounge_notifications(p_after bigint default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare latest bigint; unread bigint;
begin
 if auth.uid() is null then raise exception 'Sign in as a guest first.';end if;
 select coalesce(max(id),0) into latest from chat_messages where room_id is null;
 if p_after is null then unread:=0;
 else
  select count(*) into unread from chat_messages m where m.room_id is null and m.id>greatest(p_after,0)
   and m.user_id<>auth.uid() and not exists(select 1 from chat_blocks b where b.user_id=auth.uid() and b.blocked_user_id=m.user_id);
 end if;
 return jsonb_build_object('latestId',latest,'unread',unread);
end;$$;
revoke all on function public.lounge_notifications(bigint) from public;
grant execute on function public.lounge_notifications(bigint) to authenticated;
commit;
