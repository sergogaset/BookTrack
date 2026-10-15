// @vitest-environment node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { it } from 'vitest';

it('loads the compiled endpoint in native Node ESM without the Vite module resolver', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'booktrack-health-runtime-'));
  const files = ['api/health', 'server/health', 'shared/logger'];
  try {
    await mkdir(join(directory, 'api'));
    await mkdir(join(directory, 'server'));
    await mkdir(join(directory, 'shared'));
    await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    for (const file of files) {
      const source = await readFile(join(process.cwd(), `${file}.ts`), 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      });
      await writeFile(join(directory, `${file}.js`), outputText);
    }
    const code = `
      import assert from 'node:assert/strict';
      const { default: endpoint } = await import(process.argv[1]);
      assert.equal(typeof endpoint.fetch, 'function');
      // An unconfigured function must return a controlled 503 rather than crash at startup.
      const response = await endpoint.fetch(new Request('https://booktrack.example.test/api/health'));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: 'unavailable' });
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code, pathToFileURL(join(directory, 'api/health.js')).href], {
      encoding: 'utf8', timeout: 10000, env: {},
    });
    assert.equal(result.status, 0, `Compiled endpoint failed to start: ${result.stderr}`);
  } finally {
    // Delete only this test's explicit files and empty temporary directories.
    await Promise.allSettled([...files.map(file => unlink(join(directory, `${file}.js`))), unlink(join(directory, 'package.json'))]);
    await Promise.allSettled(['api', 'server', 'shared'].map(name => rmdir(join(directory, name))));
    await rmdir(directory);
  }
}, 15000);
