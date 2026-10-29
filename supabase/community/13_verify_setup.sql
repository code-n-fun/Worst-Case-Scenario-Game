-- Read-only check. All function names should be non-null.
select
 to_regprocedure('public.list_public_rooms()') as room_browser,
 to_regprocedure('public.chat_send(text,text,text)') as send_chat,
 to_regprocedure('public.chat_read(text,bigint)') as read_chat,
 to_regprocedure('public.wallet_read()') as wallet,
 to_regprocedure('public.shop_buy(text,text,integer)') as shop;
-- Expected: coin_wallets, coin_ledger, round_wins, chat_messages, shop_purchases.
select tablename from pg_tables where schemaname='public'
 and tablename in ('coin_wallets','coin_ledger','round_wins','chat_messages','shop_purchases')
 order by tablename;
