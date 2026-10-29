begin;
create or replace function public.list_public_rooms() returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in as a guest first.';end if;
 select coalesce(jsonb_agg(x.payload order by x.created_at desc),'[]'::jsonb) into result from (
  select r.created_at,jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'players',count(p.id),
   'capacity',8,'hostNickname',(select nickname from players where room_id=r.id order by joined_at,id limit 1)) payload
  from rooms r left join players p on p.room_id=r.id and p.active
  where r.is_public and r.expires_at>now() and r.phase<>'finished'
   and (select active and last_seen>now()-interval '45 seconds' from players a where a.room_id=r.id order by joined_at,id limit 1)
  group by r.id having count(p.id)<8 order by r.created_at desc limit 50
 )x;return result;
end;$$;
revoke all on function public.list_public_rooms() from public;
grant execute on function public.list_public_rooms() to authenticated;
commit;
