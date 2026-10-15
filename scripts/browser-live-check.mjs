import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, preview } from 'vite';

// Real production UI and real Supabase. Never intercept API or print credentials.
const env = { ...loadEnv('integration', process.cwd(), ''), ...process.env };
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'BOOKTRACK_TEST_EMAIL_A', 'BOOKTRACK_TEST_PASSWORD_A', 'BOOKTRACK_TEST_EMAIL_B', 'BOOKTRACK_TEST_PASSWORD_B'];
if (required.some(name => !env[name]) || !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
  console.log('NOT RUN: configure two dedicated confirmed accounts and a publishable key locally.');
  process.exit(2);
}
const title = `BookTrack E2E ${randomUUID()}`;
const editedTitle = `${title} edited`;
const fixtureIds = new Set();
const passed = [];
const statusCounts = { controlledAuthRefusals: 0, pageErrors: 0, consoleErrors: 0 };
let stage = 'start production preview';
let failedStage = null;
let failed = false;
let browser;
let server;
let cleanupClient;
const executablePath = env.BOOKTRACK_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const apiOrigin = new URL(env.VITE_SUPABASE_URL).origin;
const assertTrue = (condition, name) => { assert.ok(condition, name); passed.push(name); };
const trackedResponses = [];
await mkdir('docs/images/hw5', { recursive: true });
try {
  server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
  stage = 'launch browser';
  browser = await chromium.launch({ executablePath, headless: true });
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  for (const page of [pageA, pageB]) {
    page.setDefaultTimeout(20000);
    page.on('pageerror', () => statusCounts.pageErrors++);
    page.on('console', message => { if (message.type() === 'error') statusCounts.consoleErrors++; });
  }
  pageA.on('response', response => {
    if (response.url().startsWith(`${apiOrigin}/auth/v1/token`) && response.status() === 400) statusCounts.controlledAuthRefusals++;
    if (response.url().startsWith(`${apiOrigin}/rest/v1/books`) && response.request().method() === 'POST' && response.ok()) {
      trackedResponses.push((async () => {
        const records = await response.json();
        for (const record of records) if (record.title === title && typeof record.id === 'string') fixtureIds.add(record.id);
      })().catch(() => { failed = true; }));
    }
  });
  async function ready(page) {
    await page.getByRole('heading', { name: 'Моя библиотека', exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Загрузка библиотеки' }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('alert').count(), 0, 'Library loads without an API error');
  }
  async function signIn(page, account) {
    await page.getByRole('heading', { name: 'Вход', exact: true }).waitFor();
    await page.getByLabel('Email', { exact: true }).fill(env[`BOOKTRACK_TEST_EMAIL_${account}`]);
    await page.getByLabel('Пароль', { exact: true }).fill(env[`BOOKTRACK_TEST_PASSWORD_${account}`]);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await ready(page);
  }
  async function signOut(page) {
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.getByRole('heading', { name: 'Вход', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 0, 'Logout clears private cards');
  }
  stage = 'unauthenticated UI and wrong-password handling';
  await pageA.goto('http://127.0.0.1:4175');
  await pageA.getByRole('heading', { name: 'Вход', exact: true }).waitFor();
  assertTrue(await pageA.getByRole('article').count() === 0, 'Unauthenticated UI hides private books');
  await pageA.getByLabel('Email', { exact: true }).fill(env.BOOKTRACK_TEST_EMAIL_A);
  await pageA.getByLabel('Пароль', { exact: true }).fill(`${env.BOOKTRACK_TEST_PASSWORD_A}-${randomUUID()}`);
  await pageA.getByRole('button', { name: 'Войти', exact: true }).click();
  await pageA.getByRole('alert').filter({ hasText: 'Неверный email или пароль' }).waitFor();
  passed.push('Real Auth rejects a wrong password with a safe UI message');

  stage = 'user A signs in and creates fixture';
  await signIn(pageA, 'A');
  await pageA.getByRole('button', { name: 'Добавить книгу', exact: true }).click();
  await pageA.getByLabel('Название', { exact: true }).fill(title);
  await pageA.getByLabel('Автор', { exact: true }).fill('BookTrack live test');
  await pageA.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await pageA.getByRole('dialog').waitFor({ state: 'detached' });
  await pageA.getByRole('heading', { name: title, exact: true }).waitFor();
  await Promise.all(trackedResponses);
  assertTrue(fixtureIds.size === 1, 'UI CREATE returns exactly one new fixture id');

  stage = 'reload restores session and persisted book';
  await pageA.reload();
  await ready(pageA);
  await pageA.getByRole('heading', { name: title, exact: true }).waitFor();
  passed.push('Page reload restores Auth session and reads the PostgreSQL book');

  stage = 'user B isolation in an independent browser context';
  await pageB.goto('http://127.0.0.1:4175');
  await signIn(pageB, 'B');
  await pageB.getByLabel('Поиск по библиотеке').fill(title);
  assertTrue(await pageB.getByRole('heading', { name: title, exact: true }).count() === 0, 'User B cannot see the user A fixture');
  await signOut(pageB);
  passed.push('User B logout clears the library');

  stage = 'editing, rating and notes';
  await pageA.getByRole('button', { name: `Редактировать «${title}»`, exact: true }).click();
  await pageA.getByLabel('Название', { exact: true }).fill(editedTitle);
  await pageA.getByLabel('Статус', { exact: true }).selectOption('finished');
  await pageA.getByLabel('Оценка (необязательно)').fill('5');
  await pageA.getByLabel('Заметка (необязательно)').fill('Live Supabase verification');
  await pageA.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await pageA.getByRole('dialog').waitFor({ state: 'detached' });
  await pageA.getByRole('heading', { name: editedTitle, exact: true }).waitFor();
  await pageA.getByLabel('Поиск по библиотеке').fill(editedTitle);
  await pageA.getByLabel('Статус чтения').selectOption('finished');
  assertTrue(await pageA.getByRole('article').count() === 1, 'Search and status filter select the persisted edited fixture');
  await pageA.getByText('Оценка: 5 из 5', { exact: true }).waitFor();
  await pageA.locator('main#library').screenshot({ path: 'docs/images/hw5/live-library-1280.png' });
  await pageA.setViewportSize({ width: 320, height: 900 });
  await pageA.locator('main#library').screenshot({ path: 'docs/images/hw5/live-library-320.png' });
  assertTrue(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Live UI has no horizontal overflow at 320px');

  stage = 'leaving finished clears rating';
  await pageA.getByRole('button', { name: `Редактировать «${editedTitle}»`, exact: true }).click();
  await pageA.getByLabel('Статус', { exact: true }).selectOption('reading');
  await pageA.getByRole('status').filter({ hasText: 'Оценка очищена' }).waitFor();
  await pageA.getByRole('dialog').screenshot({ path: 'docs/images/hw5/live-form-320.png' });
  await pageA.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await pageA.getByRole('dialog').waitFor({ state: 'detached' });
  await pageA.getByLabel('Статус чтения').selectOption('all');
  await pageA.getByLabel('Поиск по библиотеке').fill(editedTitle);
  assertTrue(await pageA.getByText('Оценка: 5 из 5', { exact: true }).count() === 0, 'Changing finished to reading clears the saved rating');

  stage = 'logout and fresh login preserve the fixture';
  await signOut(pageA);
  await signIn(pageA, 'A');
  await pageA.getByLabel('Поиск по библиотеке').fill(editedTitle);
  await pageA.getByRole('heading', { name: editedTitle, exact: true }).waitFor();
  passed.push('Logout then fresh sign-in preserves the PostgreSQL record');

  stage = 'delete fixture through UI and verify after reload';
  await pageA.getByRole('button', { name: `Удалить «${editedTitle}»`, exact: true }).click();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await pageA.getByRole('dialog').waitFor({ state: 'detached' });
  await pageA.getByRole('status').filter({ hasText: 'Книга удалена' }).waitFor();
  await pageA.reload();
  await ready(pageA);
  await pageA.getByLabel('Поиск по библиотеке').fill(editedTitle);
  assertTrue(await pageA.getByRole('heading', { name: editedTitle, exact: true }).count() === 0, 'UI DELETE remains absent after reload');

  stage = 'same-browser account change';
  await signOut(pageA);
  await signIn(pageA, 'B');
  assertTrue(await pageA.getByLabel('Поиск по библиотеке').inputValue() === '', 'Changing accounts resets the search draft');
  await signOut(pageA);
  assertTrue(statusCounts.pageErrors === 0 && statusCounts.consoleErrors <= statusCounts.controlledAuthRefusals, 'No unexpected browser errors beyond the controlled wrong-password response');
} catch {
  failed = true;
  failedStage = stage;
  console.log('FAIL: live browser scenario failed; raw browser/network details are hidden.');
} finally {
  stage = 'cleanup newly created fixture ids';
  await Promise.all(trackedResponses);
  try {
    if (fixtureIds.size) {
      cleanupClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
      });
      const login = await cleanupClient.auth.signInWithPassword({ email: env.BOOKTRACK_TEST_EMAIL_A, password: env.BOOKTRACK_TEST_PASSWORD_A });
      if (login.error) throw new Error();
      for (const id of fixtureIds) {
        const remove = await cleanupClient.from('books').delete().eq('id', id);
        if (remove.error) throw new Error();
        const absent = await cleanupClient.from('books').select('id').eq('id', id);
        if (absent.error || absent.data?.length !== 0) throw new Error();
      }
      const logout = await cleanupClient.auth.signOut({ scope: 'local' });
      if (logout.error) throw new Error();
      passed.push('Only fixture ids created in this run were cleaned up; absence verified');
    }
  } catch { failed = true; failedStage ??= stage; console.log('Fixture cleanup failed; inspect the dedicated test account.'); }
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
const report = { checkedAt: new Date().toISOString(), result: failed ? 'FAIL' : 'PASS', failedStage,
  scope: 'Live production frontend and real Supabase Auth/PostgreSQL; no HTTP interception; two ordinary test users',
  passed, statusCounts, screenshots: ['live-library-1280.png', 'live-library-320.png', 'live-form-320.png'],
  notChecked: ['Registration form and receipt of the real confirmation email (accounts were already confirmed)', 'Dashboard logs and catalog inspection', 'Physical mobile, screen reader, 200% zoom, full contrast audit'] };
await writeFile('docs/images/hw5/live-browser-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failed) process.exitCode = 1;
