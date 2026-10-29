-- Run after 35_departure_exemptions.sql. Verifies the same fee exemptions.
begin;
create or replace function public.leave_room(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); r rooms%rowtype; me players%rowtype;
 result jsonb; eligible boolean; paid_before boolean; fee integer:=0;
begin
 if uid is null then raise exception 'Guest sign-in required.';end if;
 -- Match party_action's throttle -> identity -> room lock order.
 insert into party_rate_limits values(uid,now(),0) on conflict(user_id) do nothing;
 perform 1 from party_rate_limits where user_id=uid for update;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 select * into r from rooms where code=upper(trim(p_code)) for update;
 select * into me from players where room_id=r.id and user_id=uid;
 if me.id is null then raise exception 'Join this room first.';end if;
 select exists(select 1 from platform_coin_ledger where user_id=uid and match_id=r.match_id) into paid_before;
 -- Retrying an acknowledged departure must not debit the wallet again.
 if not me.active then
  return jsonb_build_object('left',true,'charged',0,
   'balance',coalesce((select balance from coin_wallets where user_id=uid),0));
 end if;
 eligible:=r.expires_at>now() and r.phase in ('prompt','writing','voting','results')
  and not(r.phase='results' and r.round>=r.total_rounds)
  and exists(select 1 from players where room_id=r.id and user_id<>uid
   and active and last_seen>now()-interval '45 seconds')
  and exists(select 1 from rounds q join round_players rp on rp.round_id=q.id
   where q.room_id=r.id and q.number=r.round and rp.player_id=me.id);
 result:=party_action('leave',p_code,'{}');
 if result is not null then return result;end if;
 if exists(select 1 from rooms where id=r.id and
  (phase='finished' or (phase='results' and round>=total_rounds))) then eligible:=false;end if;
 if eligible then
  select amount into fee from platform_coin_ledger where user_id=uid and match_id=r.match_id;
  if not found then raise exception 'The departure fee could not be verified. Please try again shortly.';end if;
 end if;
 return jsonb_build_object('left',true,'charged',case when paid_before then 0 else coalesce(fee,0) end,
  'balance',coalesce((select balance from coin_wallets where user_id=uid),0));
end;$$;
revoke all on function public.leave_room(text) from public,anon;
grant execute on function public.leave_room(text) to authenticated;
commit;
