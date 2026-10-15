import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { BackendError, backendError } from './backendError';
import { clearOAuthCallbackUrl, oauthFailureMessage, readOAuthCallback } from './oauthCallback';

export type AuthUser = { id: string; email?: string; expiresAt?: number };
export interface AuthService {
  restore(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string): Promise<AuthUser | null>;
  signInWithGitHub(): Promise<void>;
  signOut(): Promise<void>;
  subscribe(listener: (user: AuthUser | null) => void): () => void;
}

export function createAuthService(
  client: SupabaseClient<Database>,
  navigate: (url: string) => void = url => window.location.assign(url),
): AuthService {
  const callback = readOAuthCallback();
  let initialized = false;
  // initialize() reuses the SDK's existing promise. With PKCE + detectSessionInUrl,
  // the SDK exchanges the callback code once before we verify the restored user.
  const initialization = client.auth.initialize().then(({ error }) => {
    const unprocessedCode = callback.hasCode && new URL(window.location.href).searchParams.has('code');
    if (callback.isCallback) clearOAuthCallbackUrl();
    initialized = true;
    return callback.errorMessage || (error || unprocessedCode ? oauthFailureMessage : null);
  });
  return {
    async restore() {
      try {
        const callbackError = await initialization;
        if (callbackError) throw new BackendError('unauthenticated', callbackError);
        const { data: stored, error: storageError } = await client.auth.getSession();
        if (storageError) throw storageError;
        if (!stored.session) return null;
        // Validate the restored identity with Auth before displaying private UI.
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        return data.user ? { id: data.user.id, email: data.user.email, expiresAt: stored.session.expires_at } : null;
      } catch (cause) {
        if (cause instanceof BackendError) throw cause;
        throw backendError(cause, 'auth');
      }
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
    async signInWithGitHub() {
      try {
        await initialization;
        const { data, error } = await client.auth.signInWithOAuth({
          provider: 'github',
          options: { redirectTo: window.location.origin, scopes: 'user:email', skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (!data.url) throw new Error('OAuth redirect is unavailable.');
        navigate(data.url);
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
        // restore() handles initial URL processing, including a failed OAuth callback.
        // An early SIGNED_OUT here would hide the callback error in the UI.
        if (initialized && event !== 'INITIAL_SESSION') listener(session ? { id: session.user.id, email: session.user.email, expiresAt: session.expires_at } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
