import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from './App';
import { AuthForm } from './components/AuthForm';
import type { AuthService, AuthUser } from './data/authService';
import type { BookRepository } from './data/bookRepository';
import { BackendError } from './data/backendError';
import { useAsyncAction } from './hooks/useAsyncAction';
import { pageView } from './analytics';

export function AuthenticatedApp({ auth, repositoryFor }: {
  auth: AuthService; repositoryFor(userId: string, onInvalid: () => void): BookRepository;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const currentUser = useRef<AuthUser | null>(null);
  currentUser.current = user;
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [attempt, setAttempt] = useState(0);
  const { run, pending, error } = useAsyncAction('Не удалось выйти. Проверьте подключение и повторите попытку.');
  useEffect(() => {
    let active = true;
    let changed = false;
    setLoading(true);
    setFailure('');
    const unsubscribe = auth.subscribe(next => {
      changed = true;
      if (active) { setUser(next); setLoading(false); setFailure(''); }
    });
    void auth.restore().then(next => {
      if (active && !changed) setUser(next);
    }).catch(cause => {
      if (active && !changed) {
        setUser(null);
        setFailure(cause instanceof BackendError ? cause.message : 'Не удалось восстановить сессию. Проверьте подключение.');
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; unsubscribe(); };
  }, [auth, attempt]);
  const invalidate = useCallback((userId: string) => {
    if (currentUser.current?.id !== userId) return;
    currentUser.current = null;
    setUser(null);
    setFailure('Сессия завершена. Войдите снова.');
    // Outside the synchronous onAuthStateChange callback to avoid SDK lock contention.
    void auth.signOut().catch(() => undefined);
  }, [auth]);
  const userId = user?.id;
  const expiresAt = user?.expiresAt;
  useEffect(() => {
    if (!userId || !expiresAt) return;
    const delay = Math.max(0, expiresAt * 1000 - Date.now());
    const timer = window.setTimeout(() => invalidate(userId), Math.min(delay, 2147483647));
    return () => window.clearTimeout(timer);
  }, [userId, expiresAt, invalidate]);
  const repository = useMemo(() => userId ? repositoryFor(userId, () => invalidate(userId)) : null, [userId, repositoryFor, invalidate]);
  useEffect(() => { if (!loading) pageView(userId ? '/library' : '/auth'); }, [loading, userId]);
  if (loading) return <main role="status" className="p-8 text-center">Восстановление сессии…</main>;
  if (!user || !repository) return <>
    {failure && <div className="mx-auto max-w-md px-4 pt-6"><p role="alert" className="field-error">{failure}</p><button className="btn-secondary mt-3" onClick={() => setAttempt(value => value + 1)}>Повторить проверку сессии</button></div>}
    <AuthForm auth={auth} onAuthenticated={next => { setUser(next); setFailure(''); }} />
  </>;
  return <>
    <div className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 break-all text-sm text-slate-600">{user.email ?? 'Личный аккаунт'}</span>
        <button className="btn-secondary" disabled={pending} onClick={() => void run(async () => { await auth.signOut(); setUser(null); })}>{pending ? 'Выход…' : 'Выйти'}</button>
      </div>
      {error && <p role="alert" className="field-error mx-auto mt-3 max-w-6xl">{error}</p>}
    </div>
    <App key={user.id} repository={repository} />
  </>;
}
