import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './AuthenticatedApp';
import type { AuthService, AuthUser } from './data/authService';
import { createMockRepository, seedBooks } from './data/mockRepository';
import { BackendError } from './data/backendError';

const userA = { id: 'a', email: 'a@example.test' }, userB = { id: 'b', email: 'b@example.test' };
function setup(initial: AuthUser | null = null) {
  let listener: (user: AuthUser | null) => void = () => undefined;
  const auth: AuthService = {
    restore: vi.fn().mockResolvedValue(initial),
    signIn: vi.fn().mockResolvedValue(userA), signUp: vi.fn().mockResolvedValue(null),
    signInWithGitHub: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    subscribe(callback) { listener = callback; return vi.fn(); },
  };
  const repoA = createMockRepository({ initial: [seedBooks[0]], delayMs: 0 });
  const repoB = createMockRepository({ initial: [], delayMs: 0 });
  const repositoryFor = vi.fn((id: string, _onInvalid: () => void) => id === 'a' ? repoA : repoB);
  return { auth, repositoryFor, emit: (user: AuthUser | null) => act(() => listener(user)) };
}
describe('Authentication boundary', () => {
  it('starts GitHub OAuth without requiring email/password and blocks duplicate attempts', async () => {
    const context = setup();
    let finish!: () => void;
    vi.mocked(context.auth.signInWithGitHub).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<AuthenticatedApp {...context} />);
    const button = await screen.findByRole('button', { name: 'Войти через GitHub' });
    await userEvent.click(button);
    expect(context.auth.signInWithGitHub).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    await userEvent.click(button);
    expect(context.auth.signInWithGitHub).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Переход в GitHub…' })).toBeDisabled();
    expect(context.auth.signIn).not.toHaveBeenCalled();
  });
  it('shows a safe OAuth start error and leaves email login usable', async () => {
    const context = setup();
    vi.mocked(context.auth.signInWithGitHub).mockRejectedValue(new BackendError('network', 'Нет связи с сервером.'));
    render(<AuthenticatedApp {...context} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Войти через GitHub' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(screen.getByRole('button', { name: 'Войти через GitHub' })).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Email'), userA.email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'test-password');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByRole('article');
    expect(context.auth.signIn).toHaveBeenCalledWith(userA.email, 'test-password');
  });
  it('displays a callback cancellation and keeps the private library hidden', async () => {
    const context = setup();
    vi.mocked(context.auth.restore).mockRejectedValue(new BackendError('unauthenticated', 'Вход через GitHub отменён.'));
    render(<AuthenticatedApp {...context} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Вход через GitHub отменён');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Войти через GitHub' })).toBeEnabled();
  });
  it('protects the library, signs in and clears it on logout', async () => {
    const context = setup();
    render(<AuthenticatedApp {...context} />);
    expect(screen.getByRole('status')).toHaveTextContent('Восстановление');
    await screen.findByRole('heading', { name: 'Вход' });
    expect(context.repositoryFor).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Email'), userA.email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'test-password');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByRole('heading', { name: seedBooks[0].title });
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    await screen.findByRole('heading', { name: 'Вход' });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('restores a session and discards books, search and draft on user change', async () => {
    const context = setup(userA);
    render(<AuthenticatedApp {...context} />);
    await screen.findByRole('heading', { name: seedBooks[0].title });
    await userEvent.type(screen.getByLabelText('Поиск по библиотеке'), 'draft-search');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить книгу' }));
    await userEvent.type(screen.getByLabelText('Название', { exact: true }), 'Личный черновик');
    context.emit(userB);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Поиск по библиотеке')).toHaveValue('');
    await screen.findByText('В библиотеке пока нет книг');
  });
  it('requires email confirmation after signup', async () => {
    const context = setup();
    render(<AuthenticatedApp {...context} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Создать аккаунт' }));
    await userEvent.type(screen.getByLabelText('Email'), userA.email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'test-password');
    await userEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Проверьте почту');
    expect(screen.getByLabelText('Пароль')).toHaveValue('');
    expect(context.repositoryFor).not.toHaveBeenCalled();
  });
  it('shows safe login errors and preserves email for retry', async () => {
    const context = setup();
    vi.mocked(context.auth.signIn).mockRejectedValue(new BackendError('validation', 'Неверный email или пароль.'));
    render(<AuthenticatedApp {...context} />);
    await screen.findByRole('heading', { name: 'Вход' });
    await userEvent.type(screen.getByLabelText('Email'), userA.email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'incorrect');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль');
    expect(screen.getByLabelText('Email')).toHaveValue(userA.email);
  });
  it('ignores a late restore response after SIGNED_OUT', async () => {
    const context = setup();
    let finish!: (user: AuthUser | null) => void;
    vi.mocked(context.auth.restore).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<AuthenticatedApp {...context} />);
    context.emit(null);
    await act(async () => finish(userA));
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeVisible();
    expect(context.repositoryFor).not.toHaveBeenCalled();
  });
  it('hides private data when a backend request invalidates the session', async () => {
    const context = setup(userA);
    render(<AuthenticatedApp {...context} />);
    await screen.findByRole('article');
    const call = context.repositoryFor.mock.calls[0];
    act(() => call[1]());
    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Сессия завершена');
  });
  it('ignores an expired request from the previous account after switching users', async () => {
    const context = setup(userA);
    render(<AuthenticatedApp {...context} />);
    await screen.findByRole('article');
    const invalidateOld = context.repositoryFor.mock.calls[0][1];
    context.emit(userB);
    await screen.findByText('В библиотеке пока нет книг');
    act(invalidateOld);
    expect(screen.getByText(userB.email)).toBeVisible();
    expect(context.auth.signOut).not.toHaveBeenCalled();
  });
  it('hides the library when its access token expires without a refresh', async () => {
    const context = setup({ ...userA, expiresAt: Date.now() / 1000 + 0.2 });
    render(<AuthenticatedApp {...context} />);
    await screen.findByRole('article');
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
