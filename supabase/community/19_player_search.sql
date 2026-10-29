begin;
create or replace function public.search_players(p_query text default '',p_room text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Guest sign-in required.';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.nickname),x.id),'[]'::jsonb) into result from (
  select s.user_id id,s.nickname,coalesce(s.last_seen>now()-interval '60 seconds',false) online,
   location.code room_code,location.title room_title
  from (
   select distinct on(user_id) user_id,nickname,last_seen from (
    select user_id,nickname,last_seen from community_presence
    union all select user_id,nickname,last_seen from players where active
   ) all_people order by user_id,last_seen desc
  )s
  left join lateral (
   select r.code,r.title from players p join rooms r on r.id=p.room_id
   where p.user_id=s.user_id and p.active and p.last_seen>now()-interval '45 seconds' and r.expires_at>now()
    and (r.is_public or exists(select 1 from players me where me.room_id=r.id and me.user_id=auth.uid() and me.active))
    and (select active and last_seen>now()-interval '45 seconds' from players owner where owner.room_id=r.id order by joined_at,id limit 1)
   order by p.last_seen desc limit 1
  )location on true
  where s.user_id<>auth.uid() and s.last_seen>now()-interval '60 seconds'
   and position(lower(trim(coalesce(p_query,''))) in lower(s.nickname))>0
   and (coalesce(trim(p_room),'')='' or position(lower(trim(p_room)) in lower(coalesce(location.code,'')||' '||coalesce(location.title,'')))>0)
   and not exists(select 1 from chat_blocks b where (b.user_id=auth.uid() and b.blocked_user_id=s.user_id) or (b.user_id=s.user_id and b.blocked_user_id=auth.uid()))
  order by lower(s.nickname),s.user_id limit 50
 )x;return result;
end;$$;
revoke all on function public.search_players(text,text) from public;
grant execute on function public.search_players(text,text) to authenticated;
commit;
