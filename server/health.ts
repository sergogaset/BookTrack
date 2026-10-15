type Environment = Record<string, string | undefined>;
type CheckState = 'up' | 'down';

function origin(value: string | undefined): string {
  if (!value) throw new Error('Missing configuration');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid configuration');
  return url.origin;
}

export function createHealthHandler({ env = process.env, fetchImpl = fetch, timeoutMs = 5000 }: {
  env?: Environment; fetchImpl?: typeof fetch; timeoutMs?: number;
} = {}) {
  return async function health(request: Request): Promise<Response> {
    const respond = (status: number, body: unknown, extraHeaders?: Record<string, string>) => new Response(
      request.method === 'HEAD' ? null : JSON.stringify(body),
      { status, headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...extraHeaders,
      } },
    );
    if (request.method !== 'GET' && request.method !== 'HEAD') return respond(405, { status: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    let appUrl: string, supabaseUrl: string, key: string;
    try {
      appUrl = origin(env.BOOKTRACK_APP_URL);
      supabaseUrl = origin(env.SUPABASE_URL);
      key = env.SUPABASE_PUBLISHABLE_KEY ?? '';
      if (!/^[a-z0-9-]+\.supabase\.co$/.test(new URL(supabaseUrl).hostname) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('Invalid configuration');
    } catch { return respond(503, { status: 'unavailable' }); }

    const controller = new AbortController();
    const checks: Record<'app' | 'supabaseAuth' | 'database', CheckState> = { app: 'down', supabaseAuth: 'down', database: 'down' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Health check timeout')); }, timeoutMs);
    });
    const options: RequestInit = { signal: controller.signal, redirect: 'error', cache: 'no-store' };
    async function probe(name: keyof typeof checks, url: string, headers: Record<string, string>, validate: (response: Response) => Promise<boolean>) {
      try {
        const response = await fetchImpl(url, { ...options, headers });
        if (response.ok && await validate(response)) checks[name] = 'up';
        else await response.body?.cancel();
      } catch { /* Return a fixed health result; never expose upstream errors or bodies. */ }
    }
    try {
      await Promise.race([
        Promise.all([
          probe('app', `${appUrl}/`, { Accept: 'text/html' }, async response => {
            const html = await response.text();
            return response.headers.get('content-type')?.includes('text/html') === true && html.includes('id="root"') && html.includes('/assets/');
          }),
          probe('supabaseAuth', `${supabaseUrl}/auth/v1/health`, { apikey: key, Accept: 'application/json' }, async response => {
            const body: unknown = await response.json();
            return typeof body === 'object' && body !== null && 'name' in body && body.name === 'GoTrue';
          }),
          // This RPC executes SELECT 1 as anon and never queries a user's books.
          probe('database', `${supabaseUrl}/rest/v1/rpc/booktrack_health`, { apikey: key, Accept: 'application/json' }, async response => await response.json() === 1),
        ]),
        deadline,
      ]);
    } catch { /* Timeout is reported below without network details. */ }
    finally { clearTimeout(timer); }
    const healthy = !controller.signal.aborted && Object.values(checks).every(state => state === 'up');
    return respond(healthy ? 200 : 503, { status: healthy ? 'ok' : 'unavailable', checks });
  };
}
