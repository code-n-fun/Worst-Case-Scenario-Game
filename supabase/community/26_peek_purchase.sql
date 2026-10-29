begin;
-- Peek is a one-round purchase, never access to private plans or votes.
insert into public.shop_catalog values('item_peek','Peek at another kit',15,'hint',true) on conflict(sku) do nothing;
create or replace function public.buy_peek(p_code text,p_target uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype;rid uuid;me uuid;target uuid;cost integer;purchase uuid;result jsonb;
begin
 if auth.uid() is null or p_target is null or p_target=auth.uid() then raise exception 'Choose another player.';end if;
 select * into r from rooms where code=upper(trim(p_code)) and expires_at>now() for update;
 select id into rid from rounds where room_id=r.id and number=r.round;
 select p.id into me from players p join round_players rp on rp.player_id=p.id and rp.round_id=rid where p.room_id=r.id and p.user_id=auth.uid() and p.active;
 select p.id into target from players p join round_players rp on rp.player_id=p.id and rp.round_id=rid where p.room_id=r.id and p.user_id=p_target and p.active;
 if me is null or target is null then raise exception 'Both players must be in this round.';end if;
 select price into cost from shop_catalog where sku='item_peek' and enabled;
 if cost is null then raise exception 'Peek is unavailable.';end if;
 select s.result into result from shop_purchases s where s.user_id=auth.uid() and s.sku='item_peek' and s.match_id=r.match_id and s.round_number=r.round;
 if found then return result;end if;
 if r.phase<>'writing' or r.deadline<=now() or exists(select 1 from submissions where round_id=rid and player_id=me) then raise exception 'Peek while writing, before submitting.';end if;
 insert into coin_wallets(user_id) values(auth.uid()) on conflict do nothing;
 perform 1 from coin_wallets where user_id=auth.uid() for update;
 select jsonb_build_object('target',p_target,'nickname',p.nickname,'item',rp.items->(floor(random()*3)::int)) into result from round_players rp join players p on p.id=rp.player_id where rp.round_id=rid and rp.player_id=target;
 insert into shop_purchases(user_id,sku,price,match_id,round_number,result) values(auth.uid(),'item_peek',cost,r.match_id,r.round,result) returning id into purchase;
 perform wallet_change(auth.uid(),-cost,'purchase:'||purchase,'Peek at another kit');
 update rooms set version=version+1 where id=r.id;
 perform realtime.send('{}'::jsonb,'changed','room:'||r.code,true);
 return result;
end;$$;
revoke all on function public.buy_peek(text,uuid) from public;
grant execute on function public.buy_peek(text,uuid) to authenticated;
commit;
