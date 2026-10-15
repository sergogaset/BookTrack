import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL engine in memory. Only the Supabase Auth schema/JWT accessor is stubbed.
const db = new PGlite();
const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions++; };
const denied = async (sql, params, code) => {
  await assert.rejects(db.query(sql, params), error => error.code === code, `Expected ${code}: ${sql}`);
  assertions++;
};
async function asUser(id) {
  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.query('insert into auth.users values ($1), ($2)', [a, b]);
  const migration = await readFile(new URL('../supabase/migrations/20261015000100_create_books.sql', import.meta.url), 'utf8');
  check(!/\b(drop|truncate|delete\s+from)\b/i.test(migration), 'No destructive statements in migration');
  await db.exec(migration);
  const permissions = await db.query("select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('anon', 'authenticated')");
  check(permissions.rows.every(role => !role.rolsuper && !role.rolbypassrls), 'Assertions use roles without superuser or BYPASSRLS');
  await asUser(a);
  const created = await db.query('insert into public.books(title, author) values ($1, $2) returning *', ['\u00a0 Книга \ufeff', ' Автор ']);
  const book = created.rows[0];
  check(book.user_id === a && book.title === 'Книга' && book.author === 'Автор', 'Automatic owner and Unicode trim');
  check(book.created_at.getTime() === book.updated_at.getTime(), 'Creation timestamps match');
  await asUser(b);
  const second = await db.query("insert into public.books(title, author) values ('Другая', 'Автор') returning id");
  check((await db.query('select * from public.books')).rows.length === 1, 'B sees only B records');
  check((await db.query('select * from public.books where id=$1', [book.id])).rows.length === 0, 'Foreign SELECT denied');
  check((await db.query("update public.books set title='Forbidden' where id=$1 returning id", [book.id])).rows.length === 0, 'Foreign UPDATE denied');
  check((await db.query('delete from public.books where id=$1 returning id', [book.id])).rows.length === 0, 'Foreign DELETE denied');
  await denied("insert into public.books(title, author, user_id) values ('X', 'Y', $1)", [a], '42501');
  await denied('update public.books set user_id=$1 where id=$2', [a, second.rows[0].id], '42501');
  await denied("update public.books set created_at=now() where id=$1", [second.rows[0].id], '42501');
  await denied("update public.books set id=gen_random_uuid() where id=$1", [second.rows[0].id], '42501');
  await asUser(a);
  check((await db.query('select * from public.books')).rows.length === 1, 'A sees only A records');
  check((await db.query('select * from public.books where id=$1', [second.rows[0].id])).rows.length === 0, 'Reverse foreign SELECT denied');
  check((await db.query("update public.books set title='Forbidden' where id=$1 returning id", [second.rows[0].id])).rows.length === 0, 'Reverse foreign UPDATE denied');
  check((await db.query('delete from public.books where id=$1 returning id', [second.rows[0].id])).rows.length === 0, 'Reverse foreign DELETE denied');
  for (const [column, value] of [['title', '\u00a0\ufeff\n'], ['author', ''], ['status', 'invalid'], ['rating', 5], ['title', '📚'.repeat(101)], ['author', 'x'.repeat(121)], ['notes', 'x'.repeat(1001)]]) {
    await denied(`update public.books set ${column}=$1 where id=$2`, [value, book.id], '23514');
  }
  await denied('update public.books set title=null where id=$1', [book.id], '23502');
  const emoji = await db.query('update public.books set title=$1 where id=$2 returning title', ['📚'.repeat(100), book.id]);
  check(emoji.rows[0].title.length === 200, 'UTF-16 boundary accepted');
  const updated = await db.query("update public.books set status='finished', rating=5, notes='  ' where id=$1 returning *", [book.id]);
  check(updated.rows[0].rating === 5 && updated.rows[0].notes === null, 'Own UPDATE, rating and empty notes');
  check(updated.rows[0].created_at.getTime() === book.created_at.getTime() && updated.rows[0].updated_at >= book.updated_at, 'Server timestamps preserve creation');
  await denied('update public.books set rating=6 where id=$1', [book.id], '23514');
  await denied("update public.books set status='reading' where id=$1", [book.id], '23514');
  await db.exec('reset role; set role anon;');
  for (const sql of ['select * from public.books', "insert into public.books(title,author) values ('X','Y')", "update public.books set title='X'", 'delete from public.books']) await denied(sql, [], '42501');
  await asUser(a);
  check((await db.query('delete from public.books where id=$1 returning id', [book.id])).rows.length === 1, 'Own DELETE allowed');
  await db.exec('reset role;');
  await assert.rejects(db.exec(migration));
  await db.exec('rollback;');
  check((await db.query('select * from public.books')).rows.length === 1, 'Repeat migration stops atomically without deleting data');
  console.log(JSON.stringify({ result: 'PASS', assertions, scope: 'Local PostgreSQL/PGlite, two ordinary JWT identities plus anon; not live Supabase Auth/RLS' }, null, 2));
} finally { await db.close(); }
