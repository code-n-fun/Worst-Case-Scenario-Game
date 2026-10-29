begin;
-- Block the generic shop route for peek: it needs explicit target validation.
do $upgrade$
begin
 if to_regprocedure('public.shop_buy_base(text,text,integer)') is null then
  alter function public.shop_buy(text,text,integer) rename to shop_buy_base;
 end if;
end;$upgrade$;
revoke all on function public.shop_buy_base(text,text,integer) from public,anon,authenticated;
create or replace function public.shop_buy(p_sku text,p_room_code text default null,p_item integer default null) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if p_sku='item_peek' then raise exception 'Select a player and use the peek purchase.';end if;
 return shop_buy_base(p_sku,p_room_code,p_item);
end;$$;
revoke all on function public.shop_buy(text,text,integer) from public;
grant execute on function public.shop_buy(text,text,integer) to authenticated;
commit;
