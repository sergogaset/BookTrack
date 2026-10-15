-- Apply manually after review. No access to books or changes to existing RLS.
begin;
create function public.booktrack_health() returns boolean
language sql stable security invoker set search_path = '' as $$ select true; $$;
revoke all on function public.booktrack_health() from public;
grant execute on function public.booktrack_health() to anon, authenticated;
commit;
