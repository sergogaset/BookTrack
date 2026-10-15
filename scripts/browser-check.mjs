import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer, preview } from 'vite';

// Uses an installed browser, never downloads Chromium. Override for Linux/macOS.
const executablePath = process.env.BOOKTRACK_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
let browser;
const results = [];
const errors = [];
await mkdir('docs/images/hw4', { recursive: true });
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`); });
  async function checkSize(label, width) {
    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      return {
        viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        dialogWidth: dialog?.clientWidth ?? null, dialogScrollWidth: dialog?.scrollWidth ?? null,
      };
    });
    assert.ok(metrics.scrollWidth <= metrics.viewport, `${label}: page overflows`);
    if (metrics.dialogWidth !== null) assert.ok(metrics.dialogScrollWidth <= metrics.dialogWidth, `${label}: dialog overflows`);
    results.push({ label, requestedWidth: width, ...metrics });
  }
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('heading', { name: 'Мастер и Маргарита' }).waitFor();
    await checkSize('library', width);
    await page.screenshot({ path: `docs/images/hw4/library-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Добавить книгу', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await page.getByLabel('Название', { exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByLabel('Название', { exact: true }).fill('Я'.repeat(200));
    await page.getByLabel('Автор', { exact: true }).fill('А'.repeat(120));
    await page.getByLabel('Заметка (необязательно)').fill('Б'.repeat(1000));
    await checkSize('form-long-input', width);
    // Native showModal must keep keyboard navigation inside the modal.
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press('Tab');
      const inside = await dialog.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body);
      assert.ok(inside, 'Focus escaped to a background control');
    }
    if (width === 320) await page.screenshot({ path: 'docs/images/hw4/form-320.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('heading', { name: 'Я'.repeat(200), exact: true }).waitFor();
    await checkSize('library-long-text', width);
    if (width === 320) await page.screenshot({ path: 'docs/images/hw4/long-text-320.png', fullPage: true });
    await page.getByRole('button', { name: 'Удалить «' + 'Я'.repeat(200) + '»', exact: true }).click();
    await checkSize('delete-long-title', width);
    assert.equal(await dialog.getByRole('button', { name: 'Отмена' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Удалить «' + 'Я'.repeat(200) + '»', exact: true }).evaluate(el => el === document.activeElement), true);
  }
  await page.goto('http://127.0.0.1:5173/?mockError=list');
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Повторить' }).click();
  await page.getByRole('heading', { name: 'Мастер и Маргарита' }).waitFor();
  await page.goto('http://127.0.0.1:5173/?empty&mockError=create');
  await page.getByRole('heading', { name: 'В библиотеке пока нет книг' }).waitFor();
  await page.getByRole('button', { name: 'Добавить первую книгу' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Проверка повтора');
  await page.getByLabel('Автор', { exact: true }).fill('Автор');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Отмена', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Название', { exact: true }).inputValue(), 'Проверка повтора');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'Проверка повтора' }).waitFor();
  assert.equal(await page.getByRole('article').count(), 1);
  // Unload the HMR client before stopping dev; otherwise its reconnect poll logs a teardown error.
  await page.goto('about:blank');
  await server.close();
  const production = await preview({ preview: { host: '127.0.0.1', port: 5173, strictPort: true } });
  try {
    await page.goto('http://127.0.0.1:5173/?empty&mockError=list');
    await page.getByRole('heading', { name: 'Мастер и Маргарита' }).waitFor();
    assert.equal(await page.getByRole('article').count(), 3);
    assert.equal(await page.getByRole('alert').count(), 0);
  } finally {
    await new Promise((resolve, reject) => production.httpServer.close(error => error ? reject(error) : resolve()));
  }
  assert.deepEqual(errors, []);
  const report = { browser: await browser.version(), measurements: results, consoleAndPageErrors: errors,
    passed: ['no horizontal overflow at 320/768/1280', 'long text and modal widths', 'native modal Tab containment', 'Escape cancellation and opener focus', 'pending blocks Escape and cancel', 'load failure/retry', 'create failure/input preservation/retry', 'production build renders three books and ignores dev scenario parameters'],
    notChecked: ['physical mobile device', '200% browser zoom', 'screen reader', 'full contrast audit'] };
  await writeFile('docs/images/hw4/browser-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
