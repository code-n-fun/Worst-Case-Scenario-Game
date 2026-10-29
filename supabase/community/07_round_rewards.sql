begin;
create or replace function public.reward_round(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype; rid uuid; best integer; winner record; wins integer;
begin
 select * into r from rooms where id=p_room for update;
 select id into rid from rounds where room_id=r.id and number=r.round;
 -- Two-player practice cannot generate spendable rewards.
 if (select count(*) from round_players where round_id=rid)<3 then return;end if;
 select max(points) into best from score_events where round_id=rid;
 if coalesce(best,0)=0 then return;end if;
 for winner in select p.user_id from score_events e join players p on p.id=e.player_id
  where e.round_id=rid and e.points=best order by p.user_id loop
  insert into round_wins values(r.match_id,r.round,winner.user_id) on conflict do nothing;
  perform wallet_change(winner.user_id,10,r.match_id||':round:'||r.round||':'||winner.user_id,'Round victory');
  select count(*) into wins from round_wins where match_id=r.match_id and user_id=winner.user_id;
  if wins>=3 then perform wallet_change(winner.user_id,15,r.match_id||':three:'||winner.user_id,'Three round victories');end if;
 end loop;
end;$$;
revoke all on function public.reward_round(uuid) from public,anon,authenticated;
commit;
