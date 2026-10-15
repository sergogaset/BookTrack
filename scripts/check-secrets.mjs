import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { loadEnv } from 'vite';

const gitArgs = ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`];
const git = args => execFileSync('git', [...gitArgs, ...args], { encoding: 'utf8' });
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
assert.ok(!tracked.some(path => /(^|\/)\.env(?:\.|$)/.test(path) && path !== '.env.example'), 'A private env file is tracked');
for (const file of ['.env.local', '.env.integration.local', '.vercel/project.json']) {
  assert.ok(git(['check-ignore', file]).trim(), 'Private configuration must be ignored');
}
const env = loadEnv('integration', process.cwd(), '');
const privateValues = ['BOOKTRACK_TEST_EMAIL_A', 'BOOKTRACK_TEST_PASSWORD_A', 'BOOKTRACK_TEST_EMAIL_B', 'BOOKTRACK_TEST_PASSWORD_B', 'VERCEL_TOKEN', 'GOOGLE_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']
  .map(key => env[key]).filter(value => value && value.length >= 8);
let checked = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.vercel', '.tools', '.npm-cache'].includes(entry.name) || entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!/\.(?:[cm]?js|tsx?|json|md|sql|html|ya?ml|example)$/.test(path)) continue;
    const content = await readFile(path, 'utf8');
    assert.ok(!privateValues.some(value => content.includes(value)), `Private credential detected in ${path}`);
    assert.ok(!/(?:sb_secret_[a-zA-Z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[a-zA-Z0-9]{30,})/.test(content), `Secret pattern detected in ${path}`);
    checked++;
  }
}
await scan('.');
const historicalPaths = git(['log', '--all', '--format=', '--name-only', '--', '.env', '.env.*']).split(/\r?\n/).filter(path => path && path !== '.env.example');
assert.equal(historicalPaths.length, 0, 'A private env path exists in local Git history');
console.log(JSON.stringify({ result: 'PASS', checkedTextFiles: checked, checks: ['private env paths untracked/ignored', 'available private credentials absent from source/docs/build', 'secret patterns absent', 'private env paths absent from local Git history'], limitation: 'Heuristic scan of available local files and Git history; not a proof about remote history or external accounts' }));
