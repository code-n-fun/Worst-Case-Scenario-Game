begin;
-- Extend snapshots without replacing the original game engine.
create or replace function public.community_snapshot(p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype; roster jsonb;
begin
 if p_data is null or p_data ? 'error' then return p_data;end if;
 select * into r from rooms where code=p_data->>'code';
 select coalesce(jsonb_agg(p||jsonb_build_object('voteScore',p->'score','score',
  (select count(*) from round_wins w where w.match_id=r.match_id and w.user_id=(p->>'id')::uuid)) order by ord),'[]'::jsonb)
 into roster from jsonb_array_elements(p_data->'players') with ordinality a(p,ord);
 return p_data||jsonb_build_object('players',roster,'isPublic',r.is_public,'title',r.title,'allowRerolls',r.allow_rerolls,
  'peek',(select result from shop_purchases where user_id=auth.uid() and sku='item_peek' and match_id=r.match_id and round_number=r.round),
  'coins',coalesce((select balance from coin_wallets where user_id=auth.uid()),0),
  'hint',(select result->>'hint' from shop_purchases where user_id=auth.uid() and sku='creative_hint' and match_id=r.match_id and round_number=r.round));
end;$$;
revoke all on function public.community_snapshot(jsonb) from public,anon,authenticated;
commit;
