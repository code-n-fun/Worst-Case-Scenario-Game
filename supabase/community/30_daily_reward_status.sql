-- Run after 29_badge_label.sql. No coins are issued by reading the status.
begin;
create table if not exists public.daily_reward_accounts (
 user_id uuid primary key, welcome_day date not null
);
create table if not exists public.daily_reward_claims (
 user_id uuid not null, claim_day date not null,
 amount integer not null check(amount in (2,6)),
 created_at timestamptz not null default now(),
 primary key(user_id,claim_day)
);
alter table public.daily_reward_accounts enable row level security;
alter table public.daily_reward_claims enable row level security;
revoke all on public.daily_reward_accounts,public.daily_reward_claims
 from public,anon,authenticated;
create or replace function public.daily_reward_status() returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); today date:=(now() at time zone 'UTC')::date;
 first_day date; taken boolean;
begin
 if uid is null then raise exception 'A guest session is required.';end if;
 select welcome_day into first_day from daily_reward_accounts where user_id=uid;
 select exists(select 1 from daily_reward_claims where user_id=uid and claim_day=today) into taken;
 return jsonb_build_object('canClaim',not taken,'claimedToday',taken,
  'welcomeAvailable',first_day is null,'amount',case when first_day is null then 6 else 2 end,
  'nextClaimAt',((today+1)::timestamp at time zone 'UTC'),
  'serverTime',now());
end;$$;
revoke all on function public.daily_reward_status() from public,anon;
grant execute on function public.daily_reward_status() to authenticated;
commit;
