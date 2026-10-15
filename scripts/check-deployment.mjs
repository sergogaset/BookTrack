const deployed = process.argv[2]?.trim();
const urls = [...new Set([deployed, process.env.PRODUCTION_URL].filter(Boolean))];
if (!deployed) throw new Error('Deployment URL missing');
for (const raw of urls) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid deployment URL');
  for (const path of ['/', '/auth/callback', '/api/health']) {
    const response = await fetch(new URL(path, url), { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (response.status !== 200) throw new Error(`Deployment check failed: ${path}, HTTP ${response.status}`);
    if (path === '/api/health') {
      const health = await response.json();
      if (health.status !== 'ok' || health.checks?.database !== 'ok') throw new Error('Backend check failed');
    } else if (!(await response.text()).includes('<div id="root">')) throw new Error('SPA check failed');
    console.log(JSON.stringify({ check: path, status: response.status }));
  }
}
