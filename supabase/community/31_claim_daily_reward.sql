-- Run after 30_daily_reward_status.sql. Safe to retry or run in multiple tabs.
begin;
create or replace function public.claim_daily_reward() returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); today date:=(now() at time zone 'UTC')::date;
 first_day date; reward integer; applied integer;
begin
 if uid is null then raise exception 'A guest session is required.';end if;
 insert into daily_reward_accounts(user_id,welcome_day) values(uid,today)
 on conflict(user_id) do nothing;
 select welcome_day into first_day from daily_reward_accounts where user_id=uid for update;
 reward:=case when first_day=today then 6 else 2 end;
 insert into daily_reward_claims(user_id,claim_day,amount) values(uid,today,reward)
 on conflict(user_id,claim_day) do nothing;
 get diagnostics applied=row_count;
 if applied=1 then
  perform wallet_change(uid,reward,'daily:v1:'||uid||':'||today,
   case when first_day=today then 'Welcome gift' else 'Daily check-in' end);
 else reward:=0;
 end if;
 return jsonb_build_object('awarded',reward,'reward',daily_reward_status(),
  'balance',(select balance from coin_wallets where user_id=uid));
end;$$;
revoke all on function public.claim_daily_reward() from public,anon;
grant execute on function public.claim_daily_reward() to authenticated;
commit;
