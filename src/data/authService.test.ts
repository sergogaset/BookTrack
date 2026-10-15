import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from './authService';
import type { Database } from './database.types';

function setup() {
  const fetcher = vi.fn<typeof fetch>();
  const client = createClient<Database>('https://example.supabase.co', 'fake-public-test-key', {
    auth: { storageKey: crypto.randomUUID(), persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher },
  });
  return { auth: createAuthService(client), fetcher };
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'reader@example.test', aud: 'authenticated', created_at: '2026-10-15T00:00:00Z' };
describe('Auth service with actual SDK and intercepted HTTP', () => {
  it('registers without bypassing email confirmation and passes the application redirect', async () => {
    const { auth, fetcher } = setup();
    fetcher.mockResolvedValue(reply({ ...user, identities: [] }));
    expect(await auth.signUp(user.email, 'test-password-only')).toBeNull();
    expect(String(fetcher.mock.calls[0][0])).toContain('/auth/v1/signup');
    expect(String(fetcher.mock.calls[0][0])).toContain('redirect_to=');
  });
  it('signs in, verifies restored identity with Auth, and signs out', async () => {
    const { auth, fetcher } = setup();
    fetcher.mockResolvedValueOnce(reply({ access_token: 'fake-test-access-token', refresh_token: 'fake-test-refresh-token', token_type: 'bearer', expires_in: 3600, user }));
    expect((await auth.signIn(user.email, 'test-password-only')).id).toBe(user.id);
    fetcher.mockResolvedValueOnce(reply(user));
    expect((await auth.restore())?.id).toBe(user.id);
    expect(String(fetcher.mock.calls[1][0])).toContain('/auth/v1/user');
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await auth.signOut();
    expect(await auth.restore()).toBeNull();
  });
  it.each([['invalid_credentials', 'Неверный email или пароль'], ['email_not_confirmed', 'Подтвердите email']] as const)('handles %s without exposing backend details', async (code, expected) => {
    const { auth, fetcher } = setup();
    fetcher.mockResolvedValue(reply({ code, msg: 'internal details' }, 400));
    await expect(auth.signIn(user.email, 'incorrect')).rejects.toThrow(expected);
  });
  it('handles network failure and missing stored session', async () => {
    const { auth, fetcher } = setup();
    expect(await auth.restore()).toBeNull();
    fetcher.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(auth.signIn(user.email, 'test-password-only')).rejects.toMatchObject({ category: 'network' });
  });
});
