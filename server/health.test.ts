// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import endpoint from '../api/health';
import { createHealthHandler } from './health';

const env = {
  BOOKTRACK_APP_URL: 'https://booktrack.example.test',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_value',
};
const request = (method = 'GET') => new Request('https://booktrack.example.test/api/health', { method });
function setup() {
  const upstream = vi.fn<typeof fetch>().mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/auth/v1/health')) return Response.json({ name: 'GoTrue', version: 'not-disclosed' });
    if (url.endsWith('/rpc/booktrack_health')) return Response.json(1);
    return new Response('<html><div id="root"></div><script src="/assets/index.js"></script></html>', { headers: { 'Content-Type': 'text/html' } });
  });
  return { upstream, handler: createHealthHandler({ env, fetchImpl: upstream }) };
}
afterEach(() => vi.useRealTimers());

describe('Vercel health endpoint', () => {
  it('exports a web handler for the Vercel Node runtime', () => {
    expect(endpoint.fetch).toBeTypeOf('function');
  });
  it('returns JSON 200 only when the frontend, Auth and SQL probe succeed', async () => {
    const { handler, upstream } = setup();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', checks: { app: 'up', supabaseAuth: 'up', database: 'up' } });
    expect(upstream.mock.calls.map(([url]) => String(url))).toEqual([
      `${env.BOOKTRACK_APP_URL}/`, `${env.SUPABASE_URL}/auth/v1/health`, `${env.SUPABASE_URL}/rest/v1/rpc/booktrack_health`,
    ]);
  });
  it.each(['app', 'auth', 'database'])('returns 503 on a failing critical dependency: %s', async dependency => {
    const { upstream } = setup();
    const original = upstream.getMockImplementation()!;
    upstream.mockImplementation((input, options) => {
      const url = String(input);
      const fails = dependency === 'app' ? url === `${env.BOOKTRACK_APP_URL}/` : dependency === 'auth' ? url.includes('/auth/') : url.includes('/rpc/');
      return fails ? Promise.resolve(new Response('private-upstream-error', { status: 503 })) : original(input, options);
    });
    const response = await createHealthHandler({ env, fetchImpl: upstream })(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-upstream-error');
  });
  it('rejects a false-positive HTML page, fake Auth response and malformed SQL result', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response('not JSON or the app', { status: 200 }));
    const response = await createHealthHandler({ env, fetchImpl: upstream })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', checks: { app: 'down', supabaseAuth: 'down', database: 'down' } });
  });
  it('requires the exact harmless SQL result rather than accepting any JSON 200', async () => {
    const { upstream } = setup();
    const original = upstream.getMockImplementation()!;
    upstream.mockImplementation((input, options) => String(input).includes('/rpc/') ? Promise.resolve(Response.json({ error: 'not a successful probe' })) : original(input, options));
    const response = await createHealthHandler({ env, fetchImpl: upstream })(request());
    expect(response.status).toBe(503);
    expect((await response.json()).checks.database).toBe('down');
  });
  it('returns 503 on network errors without returning exception details or keys', async () => {
    const upstream = vi.fn<typeof fetch>().mockRejectedValue(new Error(`private-network-detail ${env.SUPABASE_PUBLISHABLE_KEY}`));
    const response = await createHealthHandler({ env, fetchImpl: upstream })(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private|sb_publishable|supabase\.co/);
  });
  it('aborts pending requests and returns 503 within the deadline even if upstream never resolves', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const pending = createHealthHandler({ env, fetchImpl: upstream, timeoutMs: 5000 })(request());
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(upstream.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
  });
  it('supports HEAD for monitors without returning a body', async () => {
    const { handler } = setup();
    const response = await handler(request('HEAD'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
  it('rejects writes without querying any dependency', async () => {
    const { handler, upstream } = setup();
    const response = await handler(request('POST'));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    {}, { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' },
    { ...env, SUPABASE_URL: 'http://project.supabase.co' },
    { ...env, SUPABASE_URL: 'https://untrusted.example.test' },
    { ...env, BOOKTRACK_APP_URL: 'https://user:password@example.test/' },
    { ...env, BOOKTRACK_APP_URL: 'https://example.test/?private=value' },
  ])('returns a safe 503 for invalid or missing server configuration', async configuration => {
    const upstream = vi.fn<typeof fetch>();
    const response = await createHealthHandler({ env: configuration, fetchImpl: upstream })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('ignores caller URL/credentials and never forwards them to Supabase or the frontend', async () => {
    const { handler, upstream } = setup();
    await handler(new Request('https://attacker.example/api/health?target=http://localhost', { headers: { Authorization: 'Bearer private-user-token', Cookie: 'private=user' } }));
    for (const [url, options] of upstream.mock.calls) {
      expect(String(url)).not.toMatch(/attacker|localhost|target=/);
      expect(options?.redirect).toBe('error');
      expect(options?.cache).toBe('no-store');
      const headers = new Headers(options?.headers);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      expect(headers.get('apikey')).toBe(String(url).startsWith(env.SUPABASE_URL) ? env.SUPABASE_PUBLISHABLE_KEY : null);
    }
  });
});
