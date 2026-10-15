import { randomUUID } from 'node:crypto';
import { log } from '../shared/logger.js';

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'no-store', 'X-Request-Id': requestId };
  if (request.method !== 'GET') {
    log('warning', 'health_method', requestId);
    return Response.json({ status: 'method_not_allowed' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
  }
  try {
    const rawUrl = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!rawUrl || !key?.startsWith('sb_publishable_')) throw new Error();
    const base = new URL(rawUrl);
    if (base.protocol !== 'https:' || base.username || base.password) throw new Error();
    const response = await fetch(new URL('/rest/v1/rpc/booktrack_health', base), {
      method: 'GET', headers: { apikey: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(4000), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok || await response.json() !== true) throw new Error();
    log('info', 'health_ok', requestId);
    return Response.json({ status: 'ok', checks: { application: 'ok', database: 'ok' } }, { headers });
  } catch {
    log('error', 'health_failed', requestId);
    return Response.json({ status: 'unavailable', checks: { application: 'ok', database: 'unavailable' } }, { status: 503, headers });
  }
}
