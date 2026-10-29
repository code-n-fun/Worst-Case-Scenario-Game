begin;
create or replace function public.reward_match(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype; best integer; winner record;
begin
 select * into r from rooms where id=p_room for update;
 select max(n) into best from (select count(*)::int n from round_wins where match_id=r.match_id group by user_id)x;
 if coalesce(best,0)=0 then return;end if;
 for winner in select user_id from round_wins where match_id=r.match_id group by user_id having count(*)=best order by user_id loop
  perform wallet_change(winner.user_id,30,r.match_id||':match:'||winner.user_id,'Overall match victory');
 end loop;
end;$$;
create or replace function public.community_room_before() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.phase='finished' and new.phase='lobby' then new.match_id:=gen_random_uuid();end if;
 return new;
end;$$;
create or replace function public.community_room_after() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.phase='results' and old.phase is distinct from 'results' then
  perform reward_round(new.id);
  if new.round=new.total_rounds then perform reward_match(new.id);end if;
 end if;
 return new;
end;$$;
revoke all on function public.reward_match(uuid),public.community_room_before(),public.community_room_after() from public,anon,authenticated;
drop trigger if exists community_before on public.rooms;
create trigger community_before before update on public.rooms for each row execute function public.community_room_before();
drop trigger if exists community_after on public.rooms;
create trigger community_after after update on public.rooms for each row execute function public.community_room_after();
commit;
