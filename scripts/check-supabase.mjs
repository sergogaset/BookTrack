import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), 'VITE_');
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key?.startsWith('sb_publishable_')) {
  console.log('Configuration: missing URL or publishable key (values hidden).');
  process.exit(2);
}
try {
  if (new URL(url).protocol !== 'https:') throw new Error();
} catch { console.log('Configuration: invalid HTTPS URL (value hidden).'); process.exit(2); }
console.log('Configuration: URL and publishable key present; values hidden.');
let failed = false;
for (const [label, path, method] of [
  ['Auth settings', '/auth/v1/settings', 'GET'],
  ['Anonymous books access', '/rest/v1/books?select=id&limit=0', 'GET'],
  ['REST CORS preflight', '/rest/v1/books', 'OPTIONS'],
]) {
  try {
    const response = await fetch(`${url}${path}`, {
      method, headers: { apikey: key, Origin: 'http://127.0.0.1:5173',
        ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'apikey,authorization,content-type' } : {}) },
      signal: AbortSignal.timeout(15000),
    });
    const result = { check: label, status: response.status };
    if (label === 'Auth settings' && response.ok) {
      const settings = await response.json();
      result.emailEnabled = settings.external?.email === true;
      result.emailConfirmationRequired = settings.mailer_autoconfirm === false;
    }
    if (label === 'Anonymous books access') {
      const body = await response.json();
      const allowedCodes = ['42501', '42P01', 'PGRST205'];
      result.code = allowedCodes.includes(body.code) ? body.code : undefined;
      result.meaning = body.code === '42501' ? 'Anonymous access denied; authenticated RLS still needs two-user test.'
        : ['42P01', 'PGRST205'].includes(body.code) ? 'Books table is absent from REST schema; migration not verified/applied.'
        : response.ok ? 'Anonymous SELECT accepted; inspect grants/RLS before using private data.' : 'Unexpected response; inspect Dashboard logs.';
      if (body.code !== '42501') failed = true;
    }
    if (method === 'OPTIONS') {
      result.allowOrigin = response.headers.get('access-control-allow-origin');
      result.allowMethods = response.headers.get('access-control-allow-methods');
    }
    if (!response.ok && label !== 'Anonymous books access') failed = true;
    console.log(JSON.stringify(result));
  } catch {
    failed = true;
    console.log(JSON.stringify({ check: label, result: 'Network request failed; endpoint and credentials hidden.' }));
  }
}
if (failed) process.exitCode = 1;
