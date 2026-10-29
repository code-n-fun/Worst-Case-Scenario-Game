begin;
create or replace function public.community_profile(p_nickname text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in as a guest first.'; end if;
 if char_length(trim(p_nickname)) not between 1 and 20 or p_nickname is null then raise exception 'Nickname must be 1-20 characters.';end if;
 insert into community_profiles values(auth.uid(),trim(p_nickname)) on conflict(user_id) do update set nickname=excluded.nickname;
end;$$;
create or replace function public.room_settings(p_code text,p_public boolean,p_title text,p_rerolls boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype;
begin
 select * into r from rooms where code=upper(trim(p_code)) for update;
 if auth.uid() is null or r.id is null or r.host<>auth.uid() or r.expires_at<=now() then raise exception 'Only the current host can edit this room.';end if;
 if not exists(select 1 from players where room_id=r.id and user_id=auth.uid() and active) then raise exception 'Join the room first.';end if;
 if char_length(trim(p_title)) not between 1 and 60 or p_title is null or p_public is null or p_rerolls is null then raise exception 'Provide a title (1-60 characters), visibility, and reroll setting.';end if;
 if r.phase<>'lobby' and p_rerolls<>r.allow_rerolls then raise exception 'Change reroll rules in the lobby.';end if;
 update rooms set is_public=p_public,title=trim(p_title),allow_rerolls=p_rerolls,version=version+1 where id=r.id;
 perform realtime.send('{}'::jsonb,'changed','room:'||r.code,true);
end;$$;
create or replace function public.list_public_rooms() returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in as a guest first.';end if;
 select coalesce(jsonb_agg(x.payload order by x.created_at desc),'[]'::jsonb) into result from (
  select r.created_at,jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'players',count(p.id),
   'capacity',8,'hostNickname',(select nickname from players where room_id=r.id and user_id=r.host)) payload
  from rooms r left join players p on p.room_id=r.id and p.active
  where r.is_public and r.expires_at>now() and r.phase<>'finished'
   and exists(select 1 from players a where a.room_id=r.id and a.active and a.last_seen>now()-interval '45 seconds')
  group by r.id having count(p.id)<8 order by r.created_at desc limit 50
 ) x;
 return result;
end;$$;
revoke all on function public.community_profile(text),public.room_settings(text,boolean,text,boolean),public.list_public_rooms() from public;
grant execute on function public.community_profile(text),public.room_settings(text,boolean,text,boolean),public.list_public_rooms() to authenticated;
commit;
