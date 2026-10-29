begin;
-- Internal only. Never grant this function to browser clients.
create or replace function public.wallet_change(p_user uuid,p_amount integer,p_event text,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare applied integer;
begin
 insert into coin_wallets(user_id) values(p_user) on conflict do nothing;
 perform 1 from coin_wallets where user_id=p_user for update;
 insert into coin_ledger(user_id,amount,event_key,reason) values(p_user,p_amount,p_event,p_reason)
 on conflict(event_key) do nothing;
 get diagnostics applied=row_count;
 if applied=1 then
  if (select balance from coin_wallets where user_id=p_user)+p_amount<0 then raise exception 'Not enough coins.';end if;
  update coin_wallets set balance=balance+p_amount where user_id=p_user;
 end if;
end;$$;
revoke all on function public.wallet_change(uuid,integer,text,text) from public,anon,authenticated;
commit;
