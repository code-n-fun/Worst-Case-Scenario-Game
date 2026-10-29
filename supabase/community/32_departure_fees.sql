begin;
create table if not exists public.platform_coin_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null, match_id uuid not null,
 amount integer not null check(amount between 0 and 3),
 reason text not null default 'Early match departure',
 created_at timestamptz not null default now(),
 unique(user_id,match_id)
);
alter table public.platform_coin_ledger enable row level security;
revoke all on public.platform_coin_ledger from public,anon,authenticated;
-- An internal transfer: wallet debit and platform receipt commit together.
create or replace function public.charge_departure_fee(p_user uuid,p_match uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare fee integer; applied integer;
begin
 insert into coin_wallets(user_id) values(p_user) on conflict do nothing;
 perform 1 from coin_wallets where user_id=p_user for update;
 select least(3,balance) into fee from coin_wallets where user_id=p_user;
 insert into platform_coin_ledger(user_id,match_id,amount) values(p_user,p_match,fee)
 on conflict(user_id,match_id) do nothing;
 get diagnostics applied=row_count;
 if applied=0 then return 0;end if;
 if fee>0 then
  perform wallet_change(p_user,-fee,'departure:'||p_match||':'||p_user,'Early match departure');
 end if;
 return fee;
end;$$;
revoke all on function public.charge_departure_fee(uuid,uuid) from public,anon,authenticated;
commit;
