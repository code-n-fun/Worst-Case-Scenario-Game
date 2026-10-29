-- Run after 32_departure_fees.sql. Only an explicit Leave action is charged.
begin;
do $$begin
 if to_regprocedure('public.room_lifecycle_base(text,text,jsonb)') is null then
  alter function public.room_lifecycle(text,text,jsonb) rename to room_lifecycle_base;
 end if;
end;$$;
revoke all on function public.room_lifecycle_base(text,text,jsonb) from public,anon,authenticated;
create or replace function public.room_lifecycle(p_action text,p_code text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype; uid uuid:=auth.uid(); result jsonb; eligible boolean:=false;
begin
 if uid is null then return jsonb_build_object('error','Guest sign-in required.');end if;
 -- Keep the original identity -> room -> wallet lock order.
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if p_action='leave' then
  select * into r from rooms where code=upper(trim(p_code)) for update;
  eligible:=r.expires_at>now() and r.phase in ('prompt','writing','voting','results')
   and not (r.phase='results' and r.round>=r.total_rounds)
   and exists(select 1 from players p join rounds q on q.room_id=p.room_id
    join round_players rp on rp.round_id=q.id and rp.player_id=p.id
    where p.room_id=r.id and p.user_id=uid and p.active and q.number=r.round);
 end if;
 result:=room_lifecycle_base(p_action,p_code,p_payload);
 if eligible and result is null then
  perform charge_departure_fee(uid,r.match_id);
 end if;
 return result;
end;$$;
revoke all on function public.room_lifecycle(text,text,jsonb) from public,anon,authenticated;
commit;
