begin;
create or replace function public.shop_buy(p_sku text,p_room_code text default null,p_item integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); product shop_catalog%rowtype; r rooms%rowtype;
 player uuid; rid uuid; purchase uuid; effect jsonb; existing jsonb;
begin
 if uid is null then raise exception 'Sign in as a guest first.';end if;
 select * into product from shop_catalog where sku=p_sku and enabled;
 if product.sku is null then raise exception 'Item not available.';end if;
 if product.kind in ('hint','reroll') then
  select * into r from rooms where code=upper(trim(p_room_code)) and expires_at>now() for update;
  select p.id into player from players p join rounds q on q.room_id=p.room_id
   join round_players rp on rp.round_id=q.id and rp.player_id=p.id
   where p.room_id=r.id and p.user_id=uid and p.active and q.number=r.round;
  if player is null then raise exception 'You must participate in this round.';end if;
  select result into existing from shop_purchases where user_id=uid and sku=p_sku and match_id=r.match_id and round_number=r.round;
  if found then return existing;end if;
  select id into rid from rounds where room_id=r.id and number=r.round;
  if r.phase<>'writing' or r.deadline<=now() or exists(select 1 from submissions where round_id=rid and player_id=player) then raise exception 'Buy before submitting, while writing is open.';end if;
  if product.kind='reroll' and not r.allow_rerolls then raise exception 'The host has disabled rerolls.';end if;
 end if;
 insert into coin_wallets(user_id) values(uid) on conflict do nothing;
 perform 1 from coin_wallets where user_id=uid for update;
 if product.kind in ('cosmetic','pack') then
  select result into existing from shop_purchases where user_id=uid and sku=p_sku and match_id is null;
  if found then return existing;end if;
 end if;
 insert into shop_purchases(user_id,sku,price,match_id,round_number)
 values(uid,p_sku,product.price,r.match_id,r.round) returning id into purchase;
 perform wallet_change(uid,-product.price,'purchase:'||purchase,'Purchase: '||product.name);
 effect:=shop_effect(p_sku,rid,player,p_item);
 update shop_purchases set result=effect where id=purchase;
 if r.id is not null then
  update rooms set version=version+1 where id=r.id;
  perform realtime.send('{}'::jsonb,'changed','room:'||r.code,true);
 end if;
 return effect;
end;$$;
revoke all on function public.shop_buy(text,text,integer) from public;
grant execute on function public.shop_buy(text,text,integer) to authenticated;
commit;
