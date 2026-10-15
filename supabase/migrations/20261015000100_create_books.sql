-- Run once, after reviewing the existing remote schema. All changes are atomic.
begin;

-- Match JavaScript String.trim(), including NBSP/BOM and Unicode spaces.
create function public.booktrack_trim(value text) returns text
language sql immutable strict set search_path = '' as $$
  select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

-- PostgreSQL char_length counts code points; the existing UI counts UTF-16 units.
create function public.booktrack_utf16_length(value text) returns integer
language sql immutable strict set search_path = '' as $$
  select coalesce(sum(case when character = '' then 0 when ascii(character) > 65535 then 2 else 1 end), 0)::integer
  from regexp_split_to_table(value, '') as character;
$$;

-- Deliberately no IF NOT EXISTS: an existing table must be inspected, not adopted.
create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  author text not null,
  status text not null default 'want_to_read',
  rating integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_title_check check (public.booktrack_utf16_length(public.booktrack_trim(title)) between 1 and 200),
  constraint books_author_check check (public.booktrack_utf16_length(public.booktrack_trim(author)) between 1 and 120),
  constraint books_status_check check (status in ('want_to_read', 'reading', 'finished')),
  constraint books_rating_check check (rating is null or (status = 'finished' and rating between 1 and 5)),
  constraint books_notes_check check (notes is null or public.booktrack_utf16_length(notes) <= 1000)
);

create function public.booktrack_prepare_book() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := public.booktrack_trim(new.title);
  new.author := public.booktrack_trim(new.author);
  new.notes := nullif(public.booktrack_trim(new.notes), '');
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'Book identity is immutable';
    end if;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger books_prepare before insert or update on public.books
for each row execute function public.booktrack_prepare_book();

-- Supports the ownership predicate, list order and FK checks when deleting a user.
create index books_owner_created_idx on public.books (user_id, created_at desc, id);

alter table public.books enable row level security;
alter table public.books force row level security;
revoke all on public.books from public, anon, authenticated;
grant select, delete on public.books to authenticated;
grant insert (title, author, status, rating, notes) on public.books to authenticated;
grant update (title, author, status, rating, notes) on public.books to authenticated;

create policy books_select_own on public.books for select to authenticated
using ((select auth.uid()) = user_id);
create policy books_insert_own on public.books for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy books_update_own on public.books for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy books_delete_own on public.books for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on function public.booktrack_trim(text) from public, anon;
revoke all on function public.booktrack_utf16_length(text) from public, anon;
revoke all on function public.booktrack_prepare_book() from public, anon;
grant execute on function public.booktrack_trim(text) to authenticated;
grant execute on function public.booktrack_utf16_length(text) to authenticated;
commit;
