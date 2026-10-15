import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = { ...loadEnv('integration', process.cwd(), ''), ...process.env };
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'BOOKTRACK_TEST_EMAIL_A', 'BOOKTRACK_TEST_PASSWORD_A', 'BOOKTRACK_TEST_EMAIL_B', 'BOOKTRACK_TEST_PASSWORD_B'];
if (required.some(name => !env[name])) {
  console.log('NOT RUN: configure two dedicated confirmed test accounts in ignored .env.integration.local; see docs/backend_documentation.md.');
  process.exit(2);
}
if (!env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
  console.log('NOT RUN: only publishable keys are permitted.'); process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } };
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const a = client(), b = client(), anon = client();
const fixtures = [];
const resultsDirectory = process.env.BOOKTRACK_RESULTS_DIR ?? 'docs/images/hw5';
const passed = [];
let failedCheck = null;
const check = (condition, name) => { if (!condition) failedCheck = name; assert.ok(condition, name); passed.push(name); };
const input = { title: 'BookTrack isolated integration fixture', author: 'Test', status: 'want_to_read', rating: null, notes: null };
let failed = false;
try {
  const loginA = await a.auth.signInWithPassword({ email: env.BOOKTRACK_TEST_EMAIL_A, password: env.BOOKTRACK_TEST_PASSWORD_A });
  const loginB = await b.auth.signInWithPassword({ email: env.BOOKTRACK_TEST_EMAIL_B, password: env.BOOKTRACK_TEST_PASSWORD_B });
  check(!loginA.error && !loginB.error && loginA.data.user && loginB.data.user, 'Two ordinary confirmed users sign in');
  check(Boolean(loginA.data.user.email_confirmed_at && loginB.data.user.email_confirmed_at), 'Both emails are confirmed by Supabase Auth');
  check(loginA.data.user.id !== loginB.data.user.id, 'Separate user identities');
  for (const owner of [a, b]) {
    const created = await owner.from('books').insert(input).select().single();
    check(!created.error && created.data?.id, 'Own CREATE and automatic owner/dates');
    fixtures.push({ owner, id: created.data.id });
    const expectedOwner = owner === a ? loginA.data.user.id : loginB.data.user.id;
    check(created.data.user_id === expectedOwner && created.data.created_at === created.data.updated_at && Number.isFinite(Date.parse(created.data.created_at)), 'Returned owner and creation timestamps match the authenticated user');
  }
  const own = fixtures[0];
  for (const [reader, foreign] of [[b, fixtures[0]], [a, fixtures[1]]]) {
    const read = await reader.from('books').select('*').eq('id', foreign.id);
    check(!read.error && read.data?.length === 0, 'Foreign SELECT returns no rows without client owner filter');
    const update = await reader.from('books').update({ title: 'Forbidden' }).eq('id', foreign.id).select();
    check(!update.error && update.data?.length === 0, 'Foreign UPDATE changes no rows');
    const remove = await reader.from('books').delete().eq('id', foreign.id).select();
    check(!remove.error && remove.data?.length === 0, 'Foreign DELETE removes no rows');
  }
  const spoofInsert = await a.from('books').insert({ ...input, user_id: loginB.data.user.id });
  check(spoofInsert.error?.code === '42501', 'Forged INSERT owner rejected by column privileges');
  const spoofUpdate = await a.from('books').update({ user_id: loginB.data.user.id }).eq('id', own.id);
  check(spoofUpdate.error?.code === '42501', 'Owner reassignment rejected');
  const dateUpdate = await a.from('books').update({ created_at: '2000-01-01T00:00:00Z' }).eq('id', own.id);
  check(dateUpdate.error?.code === '42501', 'Creation date reassignment rejected');
  for (const patch of [{ title: '\u00a0\ufeff ' }, { author: '' }, { title: '📚'.repeat(101) }, { status: 'invalid' }, { rating: 5 }, { status: 'finished', rating: 6 }, { notes: 'x'.repeat(1001) }]) {
    const invalid = await a.from('books').update(patch).eq('id', own.id);
    check(invalid.error?.code === '23514', 'Database rejects invalid field values');
  }
  const before = await a.from('books').select('*').eq('id', own.id).single();
  const edit = await a.from('books').update({ title: '\u00a0 Изменено \ufeff', status: 'finished', rating: 5 }).eq('id', own.id).select().single();
  check(!edit.error && edit.data?.title === 'Изменено' && edit.data.rating === 5 && edit.data.created_at === before.data.created_at && Date.parse(edit.data.updated_at) >= Date.parse(before.data.updated_at), 'Own UPDATE, Unicode trim, status, rating and timestamps');
  const restored = client();
  const session = loginA.data.session;
  const restore = await restored.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  const reread = await restored.from('books').select('*').eq('id', own.id);
  check(!restore.error && !reread.error && reread.data?.[0]?.title === 'Изменено', 'Session restored in independent client; PostgreSQL data persists');
  const relogged = client();
  const relogin = await relogged.auth.signInWithPassword({ email: env.BOOKTRACK_TEST_EMAIL_A, password: env.BOOKTRACK_TEST_PASSWORD_A });
  const persisted = await relogged.from('books').select('title').eq('id', own.id);
  check(!relogin.error && !persisted.error && persisted.data?.[0]?.title === 'Изменено', 'Fresh sign-in reads the previously saved PostgreSQL record');
  const extraLogout = await relogged.auth.signOut({ scope: 'local' });
  check(!extraLogout.error, 'Fresh test session signs out');
  for (const query of [anon.from('books').select('*').eq('id', own.id), anon.from('books').insert(input), anon.from('books').update({ title: 'Forbidden' }).eq('id', own.id), anon.from('books').delete().eq('id', own.id)]) {
    const result = await query;
    check(result.error?.code === '42501', 'Anonymous CRUD rejected');
  }
  const removed = await a.from('books').delete().eq('id', own.id).select('id');
  check(!removed.error && removed.data?.[0]?.id === own.id, 'Own DELETE confirmed by returned id');
  const absent = await a.from('books').select('id').eq('id', own.id);
  check(!absent.error && absent.data?.length === 0, 'Deleted fixture absent');
} catch {
  failed = true;
  console.log('FAIL: integration assertion or request failed. No credentials/payloads logged; inspect Dashboard logs.');
} finally {
  for (const { owner, id } of fixtures) {
    try {
      const cleanup = await owner.from('books').delete().eq('id', id);
      if (cleanup.error) { failed = true; console.log('Fixture cleanup failed; inspect dedicated test accounts.'); }
    } catch { failed = true; console.log('Fixture cleanup unavailable; inspect dedicated test accounts.'); }
  }
  for (const owner of [a, b]) {
    try { await owner.auth.signOut({ scope: 'local' }); } catch { /* No tokens logged. */ }
  }
}
const report = { checkedAt: new Date().toISOString(), passed, assertions: passed.length, failedCheck, result: failed ? 'FAIL' : 'PASS', scope: 'Live Supabase; ordinary users; only newly created fixture IDs modified/deleted' };
await mkdir(resultsDirectory, { recursive: true });
await writeFile(`${resultsDirectory}/live-api-results.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failed) process.exitCode = 1;
