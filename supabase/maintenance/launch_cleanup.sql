-- OWNER ONLY: run once in Supabase SQL Editor after community scripts 02-33.
-- Archives existing social data; clears messages dated before this launch cutoff.
-- Keeps wallets, reward receipts, coin ledgers, profiles, and game content.
begin;
create schema if not exists launch_backup;
revoke all on schema launch_backup from public,anon,authenticated;
create table if not exists launch_backup.completed (name text primary key);
do $$
declare cutoff timestamptz:='2026-10-29T20:33:53Z'; t text;
begin
 perform pg_advisory_xact_lock(hashtext('wcs-launch-cleanup-20261029'));
 if exists(select 1 from launch_backup.completed where name='launch-20261029') then return;end if;
 foreach t in array array['rooms','chat_messages','direct_messages',
  'message_reactions','chat_reports','direct_reports','community_presence'] loop
  execute format('create table launch_backup.%I as table public.%I',t,t);
  execute format('revoke all on launch_backup.%I from public,anon,authenticated',t);
 end loop;
 delete from public.message_reactions where
  (scope='public' and message_id in(select id from public.chat_messages where created_at<=cutoff))
  or (scope='direct' and message_id in(select id from public.direct_messages where created_at<=cutoff));
 delete from public.chat_messages where created_at<=cutoff;
 delete from public.direct_messages where created_at<=cutoff;
 delete from public.community_presence where last_seen<=cutoff;
 update public.rooms set expires_at=least(expires_at,now()),is_public=false,version=version+1
  where created_at<=cutoff;
 insert into launch_backup.completed values('launch-20261029');
end;$$;
revoke all on all tables in schema launch_backup from public,anon,authenticated;
commit;
-- No ID sequences are reset: new messages remain newer than saved read cursors.
