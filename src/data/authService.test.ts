import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthService } from './authService';
import type { Database } from './database.types';

function setup(options: { verifier?: string } = {}) {
  const fetcher = vi.fn<typeof fetch>();
  const navigate = vi.fn<(url: string) => void>();
  const storageKey = crypto.randomUUID();
  const records = new Map<string, string>();
  if (options.verifier) records.set(`${storageKey}-code-verifier`, options.verifier);
  const client = createClient<Database>('https://example.supabase.co', 'fake-public-test-key', {
    auth: {
      storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: true, flowType: 'pkce',
      storage: {
        getItem: name => records.get(name) ?? null,
        setItem: (name, value) => { records.set(name, value); },
        removeItem: name => { records.delete(name); },
      },
    },
    global: { fetch: fetcher },
  });
  return { auth: createAuthService(client, navigate), client, fetcher, navigate };
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'reader@example.test', aud: 'authenticated', created_at: '2026-10-15T00:00:00Z' };
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { window.history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

describe('Auth service with actual SDK and intercepted HTTP', () => {
  it('starts GitHub OAuth with PKCE, an origin redirect and no repository scopes', async () => {
    const { auth, navigate, fetcher } = setup();
    await auth.signInWithGitHub();
    expect(navigate).toHaveBeenCalledTimes(1);
    const target = new URL(navigate.mock.calls[0][0]);
    expect(target.origin).toBe('https://example.supabase.co');
    expect(target.pathname).toBe('/auth/v1/authorize');
    expect(target.searchParams.get('provider')).toBe('github');
    expect(target.searchParams.get('redirect_to')).toBe(window.location.origin);
    expect(target.searchParams.get('scopes')).toBe('user:email');
    expect(target.searchParams.get('code_challenge_method')).toBe('s256');
    expect(target.searchParams.get('code_challenge')).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('exchanges a callback code once, restores the verified user and cleans the URL', async () => {
    window.history.replaceState(null, '', '/?keep=1&code=fake-callback-code');
    const { auth, fetcher } = setup({ verifier: 'fake-pkce-verifier' });
    fetcher.mockResolvedValueOnce(reply({ access_token: 'fake-test-access-token', refresh_token: 'fake-test-refresh-token', token_type: 'bearer', expires_in: 3600, user }));
    fetcher.mockImplementation(async () => reply(user));
    expect((await auth.restore())?.id).toBe(user.id);
    const exchange = fetcher.mock.calls.find(([url]) => String(url).includes('/auth/v1/token'));
    expect(exchange).toBeDefined();
    expect(new URL(String(exchange![0])).searchParams.get('grant_type')).toBe('pkce');
    expect(JSON.parse(String(exchange![1]?.body))).toMatchObject({ auth_code: 'fake-callback-code', code_verifier: 'fake-pkce-verifier' });
    expect(window.location.search).toBe('?keep=1');
    expect((await auth.restore())?.id).toBe(user.id);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/auth/v1/token'))).toHaveLength(1);
  });
  it.each([
    '/?keep=1&error=access_denied&error_description=private-provider-detail',
    '/?keep=1#error=access_denied&error_description=private-provider-detail',
  ])('handles cancellation at %s without exposing provider details or losing the error to SIGNED_OUT', async url => {
    window.history.replaceState(null, '', url);
    const { auth, fetcher } = setup();
    const listener = vi.fn();
    const unsubscribe = auth.subscribe(listener);
    await expect(auth.restore()).rejects.toThrow('Вход через GitHub отменён');
    expect(listener).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('');
    expect(fetcher).not.toHaveBeenCalled();
    unsubscribe();
  });
  it('rejects a callback without its PKCE verifier and removes the abandoned code', async () => {
    window.history.replaceState(null, '', '/?code=fake-orphaned-code');
    const { auth, fetcher } = setup();
    await expect(auth.restore()).rejects.toThrow('Не удалось завершить вход через GitHub');
    expect(window.location.search).toBe('');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('handles a rejected callback exchange without leaking its response and allows password login', async () => {
    window.history.replaceState(null, '', '/?code=fake-expired-code');
    const { auth, fetcher } = setup({ verifier: 'fake-pkce-verifier' });
    fetcher.mockResolvedValueOnce(reply({ code: 'flow_state_expired', msg: 'private-provider-detail' }, 400));
    await expect(auth.restore()).rejects.toThrow('Не удалось завершить вход через GitHub');
    expect(window.location.search).toBe('');
    fetcher.mockResolvedValueOnce(reply({ access_token: 'fake-test-access-token', refresh_token: 'fake-test-refresh-token', token_type: 'bearer', expires_in: 3600, user }));
    expect((await auth.signIn(user.email, 'test-password-only')).id).toBe(user.id);
  });
  it('sanitizes an OAuth initiation error and does not navigate', async () => {
    const { auth, client, navigate } = setup();
    vi.spyOn(client.auth, 'signInWithOAuth').mockRejectedValue(new Error('private-provider-detail'));
    await expect(auth.signInWithGitHub()).rejects.toThrow('Сервис временно недоступен');
    expect(navigate).not.toHaveBeenCalled();
  });
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
