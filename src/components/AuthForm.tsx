import { useRef, useState, type FormEvent } from 'react';
import type { AuthService, AuthUser } from '../data/authService';
import { useAsyncAction } from '../hooks/useAsyncAction';

export function AuthForm({ auth, onAuthenticated }: { auth: AuthService; onAuthenticated(user: AuthUser): void }) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const { run, pending, error, clearError } = useAsyncAction('Не удалось выполнить вход. Проверьте подключение и повторите попытку.');
  const busy = pending || redirecting;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.current?.reportValidity()) return;
    await run(async () => {
      setNotice('');
      const user = await auth[mode](email.trim(), password);
      setPassword('');
      if (user) onAuthenticated(user);
      else setNotice('Проверьте почту и подтвердите email по ссылке из письма, затем войдите. Если аккаунт уже существует, используйте вход.');
    });
  }
  return <main className="mx-auto max-w-md px-4 py-12">
    <a href="#auth" className="text-3xl font-bold"><span className="text-teal-700">Book</span>Track</a>
    <section id="auth" className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-semibold">{mode === 'signIn' ? 'Вход' : 'Регистрация'}</h1>
      <p className="my-4 text-sm text-slate-600">Войдите, чтобы открыть свою личную библиотеку.</p>
      <form ref={form} onSubmit={submit}>
        <fieldset disabled={busy} className="space-y-5">
          <div><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div><label htmlFor="password">Пароль</label><input id="password" type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} required minLength={mode === 'signUp' ? 8 : 1} value={password} onChange={event => setPassword(event.target.value)} />
            {mode === 'signUp' && <p className="mt-1 text-xs text-slate-600">Минимум 8 символов. Сервер может требовать более сложный пароль.</p>}</div>
        </fieldset>
        {error && <p role="alert" className="field-error my-4">{error}</p>}
        {notice && <p role="status" className="my-4 text-sm text-teal-800">{notice}</p>}
        <button className="btn-primary mt-6 w-full" disabled={busy}>{pending ? 'Подождите…' : mode === 'signIn' ? 'Войти' : 'Зарегистрироваться'}</button>
      </form>
      <button className="btn-secondary mt-4 w-full" disabled={busy} onClick={() => void run(async () => {
        setNotice('');
        await auth.signInWithGitHub();
        setRedirecting(true);
      })}>{redirecting ? 'Переход в GitHub…' : 'Войти через GitHub'}</button>
      <button className="mt-5 text-sm font-medium text-teal-700 hover:underline" disabled={busy} onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setPassword(''); setNotice(''); clearError(); }}>
        {mode === 'signIn' ? 'Создать аккаунт' : 'Уже есть аккаунт? Войти'}
      </button>
    </section>
  </main>;
}
