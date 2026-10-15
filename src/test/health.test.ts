import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../api/health';

const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://health-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_fixture');
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Health endpoint', () => {
  it('executes a real-shaped read-only PostgREST RPC without user data or administrative authorization', async () => {
    fetcher.mockResolvedValueOnce(Response.json(true));
    const response = await GET(new Request('https://app.example/api/health'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', checks: { application: 'ok', database: 'ok' } });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://health-test.supabase.co/rest/v1/rpc/booktrack_health');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error', headers: { apikey: 'sb_publishable_test_fixture' } });
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([401, 404, 500, 503])('returns 503 for upstream %i without leaking the body', async status => {
    fetcher.mockResolvedValueOnce(new Response('private upstream details', { status }));
    const response = await GET(new Request('https://app.example/api/health'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private|supabase|publishable|stack/);
  });
  it.each([false, {}, 'true'])('rejects an invalid DB response %j', async value => {
    fetcher.mockResolvedValueOnce(Response.json(value));
    expect((await GET(new Request('https://app.example/api/health'))).status).toBe(503);
  });
  it('returns 503 on timeout/network failure', async () => {
    fetcher.mockRejectedValueOnce(new DOMException('secret network address', 'TimeoutError'));
    expect((await GET(new Request('https://app.example/api/health'))).status).toBe(503);
  });
  it('fails closed for absent or administrative keys', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_test_fixture');
    expect((await GET(new Request('https://app.example/api/health'))).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects writes', async () => {
    expect((await GET(new Request('https://app.example/api/health', { method: 'POST' }))).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
