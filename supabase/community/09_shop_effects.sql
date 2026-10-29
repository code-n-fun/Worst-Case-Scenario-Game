begin;
-- Internal effect handler; called only after purchase validation.
create or replace function public.shop_effect(p_sku text,p_round uuid,p_player uuid,p_item integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare kit jsonb; replacement text; suggestions text[]:=array[
 'Use one item as a distraction, another as a tool, and the third as your escape route.',
 'Try negotiating with the threat. What unusual gift could you make from your items?',
 'Combine two items into a ridiculous invention. Save the third as your backup plan.',
 'Turn the threat into your teammate: offer a job, a snack, or a wildly exaggerated promise.'
 ];
begin
 if p_sku='creative_hint' then return jsonb_build_object('hint',suggestions[1+floor(random()*4)::int]);end if;
 if p_sku='item_reroll' then
  if p_item is null or p_item not between 0 and 2 then raise exception 'Choose item index 0, 1, or 2.';end if;
  select items into kit from round_players where round_id=p_round and player_id=p_player for update;
  select item into replacement from unnest(array['A raw steak','A roll of duct tape','A trombone','A rubber duck','A glitter cannon','A tiny umbrella','A kazoo','Roller skates','A traffic cone','A garden gnome','A pool noodle','A box of crayons']) item
   where not kit @> jsonb_build_array(item) order by random() limit 1;
  kit:=jsonb_set(kit,array[p_item::text],to_jsonb(replacement));
  update round_players set items=kit where round_id=p_round and player_id=p_player;
  return jsonb_build_object('items',kit,'replacement',replacement);
 end if;
 return jsonb_build_object('unlocked',p_sku);
end;$$;
revoke all on function public.shop_effect(text,uuid,uuid,integer) from public,anon,authenticated;
commit;
