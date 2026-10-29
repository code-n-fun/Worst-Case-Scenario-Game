begin;
create table if not exists public.community_presence (
 user_id uuid primary key,nickname text not null check(char_length(nickname) between 1 and 20),
 last_seen timestamptz not null default now()
);
alter table public.community_presence enable row level security;
revoke all on public.community_presence from anon,authenticated;
create or replace function public.player_presence(p_nickname text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Guest sign-in required.';end if;
 if p_nickname is null or char_length(trim(p_nickname)) not between 1 and 20 then raise exception 'Choose a nickname first.';end if;
 insert into community_presence values(auth.uid(),trim(p_nickname),now()) on conflict(user_id)
 do update set nickname=excluded.nickname,last_seen=now();
 insert into community_profiles values(auth.uid(),trim(p_nickname)) on conflict(user_id) do update set nickname=excluded.nickname;
end;$$;
revoke all on function public.player_presence(text) from public;
grant execute on function public.player_presence(text) to authenticated;
commit;
