import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { BackendError, backendError } from './backendError';

export type AuthUser = { id: string; email?: string; expiresAt?: number };
export interface AuthService {
  restore(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signInWithGoogle(): Promise<void>;
  signUp(email: string, password: string): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  subscribe(listener: (user: AuthUser | null) => void): () => void;
}

export function createAuthService(client: SupabaseClient<Database>): AuthService {
  const callbackUrl = new URL(window.location.href);
  const fragment = new URLSearchParams(callbackUrl.hash.slice(1));
  const callbackFailed = callbackUrl.searchParams.has('error') || fragment.has('error');
  let clearNeeded = callbackUrl.pathname === '/auth/callback' || callbackUrl.searchParams.has('code') || callbackFailed || fragment.has('access_token');
  function clearCallback() {
    if (!clearNeeded) return;
    clearNeeded = false;
    for (const key of ['code', 'error', 'error_code', 'error_description']) callbackUrl.searchParams.delete(key);
    if (fragment.has('access_token') || fragment.has('error') || fragment.has('refresh_token')) callbackUrl.hash = '';
    if (callbackUrl.pathname === '/auth/callback') callbackUrl.pathname = '/';
    window.history.replaceState(null, '', callbackUrl.pathname + callbackUrl.search + callbackUrl.hash);
  }
  return {
    async restore() {
      try {
        const { data: stored, error: storageError } = await client.auth.getSession();
        clearCallback();
        if (callbackFailed) {
          throw new BackendError('validation', 'Вход через Google отменён или не завершён. Попробуйте снова.');
        }
        if (storageError) throw storageError;
        if (!stored.session) return null;
        // Validate the restored identity with Auth before displaying private UI.
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        return data.user ? { id: data.user.id, email: data.user.email, expiresAt: stored.session.expires_at } : null;
      } catch (cause) { clearCallback(); throw cause instanceof BackendError ? cause : backendError(cause, 'auth'); }
    },
    async signInWithGoogle() {
      try {
        const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: {
          redirectTo: `${window.location.origin}/auth/callback`, scopes: 'openid email profile',
        } });
        if (error) throw error;
      } catch (cause) { throw backendError(cause, 'auth'); }
    },
    async signIn(email, password) {
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { id: data.user.id, email: data.user.email, expiresAt: data.session.expires_at };
      } catch (cause) { throw backendError(cause, 'auth'); }
    },
    async signUp(email, password) {
      try {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        return data.session && data.user ? { id: data.user.id, email: data.user.email, expiresAt: data.session.expires_at } : null;
      } catch (cause) { throw backendError(cause, 'auth'); }
    },
    async signOut() {
      try {
        // Revoke this browser's session; leave other devices signed in.
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch (cause) { throw backendError(cause, 'auth'); }
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // INITIAL_SESSION is independently verified by restore(). No async SDK calls here.
        if (event !== 'INITIAL_SESSION') listener(session ? { id: session.user.id, email: session.user.email, expiresAt: session.expires_at } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
