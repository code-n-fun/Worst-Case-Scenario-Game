begin;
create or replace function public.wallet_read() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in as a guest first.';end if;
 return jsonb_build_object(
  'balance',coalesce((select balance from coin_wallets where user_id=auth.uid()),0),
  'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by price) from shop_catalog c where enabled),'[]'::jsonb),
  'unlocks',coalesce((select jsonb_agg(sku) from shop_purchases where user_id=auth.uid() and match_id is null),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from
   (select amount,reason,created_at from coin_ledger where user_id=auth.uid() order by created_at desc limit 50)h),'[]'::jsonb)
 );
end;$$;
revoke all on function public.wallet_read() from public;
grant execute on function public.wallet_read() to authenticated;
commit;
