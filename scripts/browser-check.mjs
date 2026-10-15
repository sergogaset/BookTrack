import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer, loadEnv, preview } from 'vite';

// Browser E2E against intercepted HTTP fixtures, never real user records or Auth.
const env = loadEnv('development', process.cwd(), 'VITE_');
const apiOrigin = new URL(env.VITE_SUPABASE_URL).origin;
const executablePath = process.env.BOOKTRACK_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'reader@example.test', aud: 'authenticated', created_at: '2026-10-15T00:00:00Z', app_metadata: {}, user_metadata: {} };
const expiry = Math.floor(Date.now() / 1000) + 3600;
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expiry, role: 'authenticated' })}.fake-test-signature`, refresh_token: 'fake-browser-fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user };
const now = new Date().toISOString();
const initial = { id: '20000000-0000-4000-8000-000000000001', user_id: user.id, title: 'Мастер и Маргарита', author: 'Михаил Булгаков', status: 'reading', rating: null, notes: null, created_at: now, updated_at: now };
let records = [];
let failCreate = false;
let createRequests = 0;
const errors = [];
const measurements = [];
const passed = [];
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
let browser;
let production;
await mkdir('docs/images/hw5', { recursive: true });
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext();
  await context.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'x-supabase-api-version': '2024-01-01' };
    const respond = (data, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
    if (request.method() === 'OPTIONS') return respond({});
    if (url.pathname === '/auth/v1/signup') return respond(user);
    if (url.pathname === '/auth/v1/token') return respond(session);
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/auth/v1/logout') return respond({});
    assert.equal(url.pathname, '/rest/v1/books', 'Unexpected API endpoint in fixture');
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (request.method() === 'GET') return respond(records.filter(book => !id || book.id === id));
    if (request.method() === 'POST') {
      createRequests++;
      if (failCreate) {
        failCreate = false;
        // SDK receives a real-shaped validation refusal (guaranteed no write).
        return respond({ code: '23514', message: 'fixture validation refusal' }, 400);
      }
      const book = { ...request.postDataJSON(), id: randomUUID(), user_id: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      records.push(book);
      return respond([book], 201);
    }
    if (request.method() === 'PATCH') {
      records = records.map(book => book.id === id ? { ...book, ...request.postDataJSON(), updated_at: new Date().toISOString() } : book);
      return respond(records.filter(book => book.id === id));
    }
    if (request.method() === 'DELETE') {
      const selected = records.filter(book => book.id === id).map(book => ({ id: book.id }));
      records = records.filter(book => book.id !== id);
      return respond(selected);
    }
    throw new Error('Unexpected fixture method');
  });
  const page = await context.newPage();
  page.on('pageerror', () => errors.push('Uncaught page error (details omitted).'));
  page.on('console', message => { if (message.type() === 'error') errors.push('Browser console error (details omitted).'); });
  page.on('response', response => { if (response.url().startsWith(apiOrigin) && response.status() >= 400) passed.push('Controlled API refusal displayed'); });
  async function checkSize(label, width) {
    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, dialogWidth: dialog?.clientWidth ?? null, dialogScrollWidth: dialog?.scrollWidth ?? null };
    });
    assert.ok(metrics.scrollWidth <= metrics.viewport, `${label}: page overflow`);
    if (metrics.dialogWidth !== null) assert.ok(metrics.dialogScrollWidth <= metrics.dialogWidth, `${label}: dialog overflow`);
    measurements.push({ label, width, ...metrics });
  }
  async function signIn() {
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Пароль', { exact: true }).fill('browser-test-password');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('heading', { name: 'Моя библиотека' }).waitFor();
  }
  for (const width of [320, 768, 1280]) {
    records = [{ ...initial }];
    await context.clearCookies();
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5173');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('heading', { name: 'Вход', exact: true }).waitFor();
    await checkSize('auth', width);
    if (width === 320) {
      await page.screenshot({ path: 'docs/images/hw5/auth-320.png', fullPage: true });
      await page.getByRole('button', { name: 'Создать аккаунт' }).click();
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByLabel('Пароль', { exact: true }).fill('browser-test-password');
      await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
      await page.getByRole('status').filter({ hasText: 'Проверьте почту' }).waitFor();
      await page.getByRole('button', { name: 'Уже есть аккаунт? Войти' }).click();
    }
    await signIn();
    await page.getByRole('heading', { name: initial.title }).waitFor();
    await checkSize('library', width);
    await page.screenshot({ path: `docs/images/hw5/library-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Добавить книгу', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await page.getByLabel('Название', { exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByLabel('Название', { exact: true }).fill('Я'.repeat(200));
    await page.getByLabel('Автор', { exact: true }).fill('А'.repeat(120));
    await page.getByLabel('Заметка (необязательно)').fill('Б'.repeat(1000));
    await checkSize('form-long-input', width);
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body), 'Modal contains keyboard focus');
    }
    if (width === 320) await page.screenshot({ path: 'docs/images/hw5/form-320.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('heading', { name: 'Я'.repeat(200), exact: true }).waitFor();
    await checkSize('long-card', width);
    await page.getByRole('button', { name: `Редактировать «${'Я'.repeat(200)}»`, exact: true }).click();
    await page.getByLabel('Название', { exact: true }).fill('Изменённая книга');
    await page.getByLabel('Статус', { exact: true }).selectOption('finished');
    await page.getByLabel('Оценка (необязательно)').fill('5');
    await page.getByLabel('Заметка (необязательно)').fill('<script>window.fixtureXss=true</script>');
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByText('Оценка: 5 из 5').waitFor();
    assert.equal(await page.evaluate(() => window.fixtureXss), undefined);
    await page.reload();
    await page.getByRole('heading', { name: 'Изменённая книга' }).waitFor();
    await page.getByLabel('Поиск по библиотеке').fill('изменённая');
    await page.getByLabel('Статус чтения').selectOption('finished');
    assert.equal(await page.getByRole('article').count(), 1);
    await page.getByRole('button', { name: 'Удалить «Изменённая книга»', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Отмена' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Удалить «Изменённая книга»', exact: true }).click();
    await dialog.getByRole('button', { name: 'Удалить', exact: true }).click();
    await page.getByRole('heading', { name: 'Ничего не найдено' }).waitFor();
    await page.getByRole('button', { name: 'Сбросить условия' }).click();
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.getByRole('heading', { name: 'Вход', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 0);
    passed.push(`Auth, CRUD, status, XSS, search/filter, session reload, logout at ${width}px (HTTP fixtures)`);
  }
  records = [];
  await signIn();
  await page.getByRole('heading', { name: 'В библиотеке пока нет книг' }).waitFor();
  await page.getByRole('button', { name: 'Добавить первую книгу' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Повтор после отказа');
  await page.getByLabel('Автор', { exact: true }).fill('Автор');
  failCreate = true;
  const before = createRequests;
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(createRequests, before + 1);
  assert.equal(await page.getByLabel('Название', { exact: true }).inputValue(), 'Повтор после отказа');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(records.length, 1);
  passed.push('Validation refusal preserves draft; explicit retry creates one record');
  await page.goto('about:blank');
  await server.close();
  production = await preview({ preview: { host: '127.0.0.1', port: 5173, strictPort: true } });
  await page.goto('http://127.0.0.1:5173/?empty&mockError=list');
  await page.getByRole('heading', { name: 'Повтор после отказа' }).waitFor();
  passed.push('Production build uses Auth/API and ignores former dev mock parameters');
  // Chromium emits one console error for the intentionally injected HTTP 400.
  assert.equal(errors.filter(value => value.startsWith('Uncaught')).length, 0);
  assert.ok(errors.length <= 1, 'No unexpected console errors beyond controlled HTTP refusal');
  const report = { date: '2026-10-15', browser: await browser.version(), scope: 'Actual UI and Supabase SDK; intercepted HTTP fixtures. Not evidence of remote database/Auth/RLS.', measurements, passed, expectedConsoleErrors: errors.length, notChecked: ['Live Supabase end-to-end', 'Live two-user RLS', 'Physical mobile', '200% zoom', 'Screen reader', 'Full contrast audit'] };
  await writeFile('docs/images/hw5/browser-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
}
