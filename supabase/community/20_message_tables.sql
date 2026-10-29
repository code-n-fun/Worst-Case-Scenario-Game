begin;
alter table public.chat_messages add column if not exists reply_to bigint references public.chat_messages(id) on delete set null;
create table if not exists public.direct_messages (
 id bigint generated always as identity primary key,sender_id uuid not null,recipient_id uuid not null,
 body text not null check(char_length(body) between 1 and 300),
 reply_to bigint references public.direct_messages(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),check(sender_id<>recipient_id)
);
create index if not exists direct_message_threads on public.direct_messages(recipient_id,sender_id,id desc);
create index if not exists direct_message_sender on public.direct_messages(sender_id,recipient_id,id desc);
create table if not exists public.direct_reads (
 user_id uuid not null,peer_id uuid not null,last_read bigint not null default 0,primary key(user_id,peer_id)
);
create table if not exists public.message_reactions (
 scope text not null check(scope in ('public','direct')),message_id bigint not null,user_id uuid not null,
 emoji text not null check(emoji in ('👍','❤️','😂','🔥','👏','😮','🫡','👀')),
 primary key(scope,message_id,user_id,emoji)
);
create table if not exists public.direct_reports (
 user_id uuid not null,message_id bigint references public.direct_messages on delete cascade,
 reason text not null check(char_length(reason) between 1 and 300),primary key(user_id,message_id)
);
alter table public.direct_messages enable row level security;
alter table public.direct_reads enable row level security;
alter table public.message_reactions enable row level security;
alter table public.direct_reports enable row level security;
revoke all on public.direct_messages,public.direct_reads,public.message_reactions,public.direct_reports from anon,authenticated;
drop policy if exists personal_message_receive on realtime.messages;
create policy personal_message_receive on realtime.messages for select to authenticated
 using(realtime.topic()='person:'||auth.uid()::text);
commit;
