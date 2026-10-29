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
  'coins',coalesce((select balance from coin_wallets where user_id=auth.uid()),0),
  'hint',(select result->>'hint' from shop_purchases where user_id=auth.uid() and sku='creative_hint' and match_id=r.match_id and round_number=r.round));
end;$$;
revoke all on function public.community_snapshot(jsonb) from public,anon,authenticated;
create or replace function public.party_action(p_action text,p_code text default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare hits integer;uid uuid:=auth.uid();
begin
 if uid is null then return jsonb_build_object('error','Guest sign-in required.');end if;
 insert into party_rate_limits values(uid,now(),1) on conflict(user_id) do update set
  requests=case when party_rate_limits.window_start<now()-interval '1 minute' then 1 else party_rate_limits.requests+1 end,
  window_start=case when party_rate_limits.window_start<now()-interval '1 minute' then now() else party_rate_limits.window_start end returning requests into hits;
 if hits>180 then return jsonb_build_object('error','Too many requests. Please wait a minute.');end if;
 begin return community_snapshot(party_action_internal(p_action,p_code,p_payload));
 exception when others then return jsonb_build_object('error',sqlerrm);end;
end;$$;
revoke all on function public.party_action(text,text,jsonb) from public;
grant execute on function public.party_action(text,text,jsonb) to authenticated;
commit;
