-- Run AFTER the complete original 001_party.sql. Run each numbered file in order.
begin;
alter table public.rooms add column if not exists is_public boolean not null default false;
alter table public.rooms add column if not exists title text not null default 'Worst Case Scenario';
alter table public.rooms add column if not exists allow_rerolls boolean not null default false;
alter table public.rooms add column if not exists match_id uuid not null default gen_random_uuid();
create table if not exists public.community_profiles (
 user_id uuid primary key, nickname text not null check(char_length(nickname) between 1 and 20)
);
create table if not exists public.chat_messages (
 id bigint generated always as identity primary key, room_id uuid references public.rooms on delete cascade,
 user_id uuid not null, nickname text not null, body text not null check(char_length(body) between 1 and 300),
 invite_code text, created_at timestamptz not null default clock_timestamp()
);
create index if not exists chat_messages_recent on public.chat_messages(room_id,id desc);
create table if not exists public.chat_blocks (
 user_id uuid not null, blocked_user_id uuid not null, primary key(user_id,blocked_user_id), check(user_id<>blocked_user_id)
);
create table if not exists public.chat_reports (
 user_id uuid not null, message_id bigint references public.chat_messages on delete cascade,
 reason text not null check(char_length(reason) between 1 and 300), created_at timestamptz not null default now(),
 primary key(user_id,message_id)
);
create table if not exists public.coin_wallets (
 user_id uuid primary key, balance integer not null default 0 check(balance>=0)
);
create table if not exists public.coin_ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 amount integer not null check(amount<>0), event_key text unique not null,
 reason text not null, created_at timestamptz not null default now()
);
create table if not exists public.round_wins (
 match_id uuid not null, round_number integer not null, user_id uuid not null,
 primary key(match_id,round_number,user_id)
);
create table if not exists public.shop_catalog (
 sku text primary key, name text not null, price integer not null check(price>0),
 kind text not null check(kind in ('hint','reroll','cosmetic','pack')), enabled boolean not null default true
);
create table if not exists public.shop_purchases (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 sku text not null references public.shop_catalog, price integer not null,
 match_id uuid, round_number integer, result jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create unique index if not exists one_purchase_per_round on public.shop_purchases(user_id,sku,match_id,round_number)
 where match_id is not null;
create unique index if not exists one_permanent_unlock on public.shop_purchases(user_id,sku) where match_id is null;
insert into public.shop_catalog(sku,name,price,kind) values
 ('creative_hint','Creative hint',10,'hint'),('item_reroll','Reroll one item',20,'reroll'),
 ('goose_badge','Goose Negotiator badge',50,'cosmetic'),('victory_sparkles','Victory sparkles',100,'cosmetic')
on conflict(sku) do nothing;
-- Scenario packs are not offered until their playable content is implemented.
alter table public.community_profiles enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_blocks enable row level security;
alter table public.chat_reports enable row level security;
alter table public.coin_wallets enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.round_wins enable row level security;
alter table public.shop_catalog enable row level security;
alter table public.shop_purchases enable row level security;
revoke all on public.community_profiles,public.chat_messages,public.chat_blocks,public.chat_reports,
 public.coin_wallets,public.coin_ledger,public.round_wins,public.shop_catalog,public.shop_purchases from anon,authenticated;
commit;
