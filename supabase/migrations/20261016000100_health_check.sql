-- Health probe only: no table access, user data, elevated privileges or RLS changes.
begin;

create or replace function public.booktrack_health() returns integer
language sql stable security invoker set search_path = '' as $$
  select 1;
$$;

revoke all on function public.booktrack_health() from public, anon, authenticated;
grant execute on function public.booktrack_health() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
