import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from 'vite';

// Read only the production environment downloaded by `vercel pull`.
// Never print values: this file can also contain server-side secrets.
try {
  const env = loadEnv('production', '.vercel', 'VITE_');
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let validUrl = false;
  try {
    validUrl = typeof url === 'string' && url === url.trim() && new URL(url).protocol === 'https:';
  } catch { /* Invalid values are reported by name only below. */ }
  const invalid = [];
  if (!validUrl || url.includes('ci.example.invalid')) invalid.push('VITE_SUPABASE_URL');
  if (typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || key === 'sb_publishable_ci_placeholder') {
    invalid.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  }
  if (invalid.length) {
    console.error(`Invalid or missing Vercel Production variables: ${invalid.join(', ')}. Values hidden.`);
    process.exitCode = 1;
  } else if (process.argv.includes('--artifacts')) {
    const directory = '.vercel/output/static/assets';
    const files = (await readdir(directory)).filter(name => name.endsWith('.js'));
    const js = (await Promise.all(files.map(name => readFile(join(directory, name), 'utf8')))).join('\n');
    if (!files.length || !js.includes(url) || !js.includes(key) || js.includes('sb_publishable_ci_placeholder')) {
      console.error('Vercel artifacts do not contain the expected production Supabase configuration. Values hidden.');
      process.exitCode = 1;
    } else {
      console.log('PASS: prebuilt artifacts contain the production Supabase configuration. Values hidden.');
    }
  } else {
    console.log('PASS: Vercel production Supabase configuration is valid. Values hidden.');
  }
} catch {
  console.error('Could not verify Vercel production configuration or artifacts. Raw details hidden.');
  process.exitCode = 1;
}
