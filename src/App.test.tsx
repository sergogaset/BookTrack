import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createMockRepository, seedBooks } from './data/mockRepository';
import { BackendError } from './data/backendError';
import { reachGoal } from './analytics';
vi.mock('./analytics', () => ({ reachGoal: vi.fn() }));

describe('Library — T-01/T-04/T-05/T-06/T-08', () => {
  it('blocks uncertain create retry until the user closes the draft and reviews the list', async () => {
    const repo = createMockRepository({ initial: [], delayMs: 0 });
    repo.create = vi.fn().mockRejectedValue(new BackendError('network', 'Не удалось подтвердить сохранение. Закройте форму и обновите список.', true));
    render(<App repository={repo} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить первую книгу' }));
    await userEvent.type(screen.getByLabelText('Название', { exact: true }), 'Черновик');
    await userEvent.type(screen.getByLabelText('Автор', { exact: true }), 'Автор');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подтвердить сохранение');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByLabelText('Название', { exact: true })).toHaveValue('Черновик');
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(reachGoal).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await userEvent.click(screen.getByRole('button', { name: 'Обновить список' }));
    expect(await screen.findByRole('heading', { name: 'В библиотеке пока нет книг' })).toBeVisible();
  });
  it('rejects a malformed response instead of presenting it as an empty or valid library', async () => {
    const repo = createMockRepository({ delayMs: 0 });
    repo.list = vi.fn().mockResolvedValue([{ ...seedBooks[0], status: 'invalid' }]);
    render(<App repository={repo} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить книги');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('В библиотеке пока нет книг')).not.toBeInTheDocument();
  });
  it('shows loading, load failure and retry without a false empty state', async () => {
    const repo = createMockRepository({ delayMs: 0 });
    repo.failNext('list');
    render(<App repository={repo} />);
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка');
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить книги');
    await userEvent.type(screen.getByLabelText('Поиск по библиотеке'), 'мастер');
    expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('heading', { name: 'Мастер и Маргарита' })).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('searches by author, intersects with status and resets without deleting data', async () => {
    render(<App repository={createMockRepository({ delayMs: 0 })} />);
    await screen.findByRole('heading', { name: 'Мастер и Маргарита' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Поиск по библиотеке'), ' БУЛГАКОВ ');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Статус чтения'), 'finished');
    expect(screen.getByText('Ничего не найдено')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Сбросить условия' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('creates a hidden book once, announces success and offers filter reset', async () => {
    const repo = createMockRepository({ delayMs: 0 });
    render(<App repository={repo} />);
    await screen.findByRole('heading', { name: 'Мастер и Маргарита' });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Статус чтения'), 'finished');
    await user.click(screen.getByRole('button', { name: 'Добавить книгу' }));
    await user.type(screen.getByLabelText('Название'), ' Новая ');
    await user.type(screen.getByLabelText('Автор'), ' Автор ');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Книга скрыта текущими условиями');
    await user.click(screen.getByRole('button', { name: 'Сбросить условия' }));
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(await repo.list()).toHaveLength(4);
    expect(reachGoal).toHaveBeenCalledExactlyOnceWith('book_created');
  });

  it('edits the selected book using the shared form and renders notes as text', async () => {
    const repo = createMockRepository({ delayMs: 0 });
    render(<App repository={repo} />);
    await screen.findByRole('heading', { name: 'Мастер и Маргарита' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Редактировать «Мастер и Маргарита»' }));
    expect(screen.getByLabelText('Автор')).toHaveValue('Михаил Булгаков');
    await user.selectOptions(screen.getByLabelText('Статус'), 'finished');
    await user.type(screen.getByLabelText('Оценка (необязательно)'), '5');
    await user.type(screen.getByLabelText('Заметка (необязательно)'), '<script>alert(1)</script>');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Оценка: 5 из 5')).toBeVisible();
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(document.querySelector('article script')).toBeNull();
    expect(reachGoal).toHaveBeenCalledExactlyOnceWith('book_finished');
    expect((await repo.list()).find(book => book.id === seedBooks[0].id)?.created_at).toBe(seedBooks[0].created_at);
  });

  it('requires confirmation, preserves the card after failure, retries and reaches empty', async () => {
    const repo = createMockRepository({ initial: [seedBooks[0]], delayMs: 0 });
    render(<App repository={repo} />);
    await screen.findByRole('heading', { name: seedBooks[0].title });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Удалить «${seedBooks[0].title}»` }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' })).toHaveFocus();
    repo.failNext('remove');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить книгу');
    expect(reachGoal).not.toHaveBeenCalled();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText('В библиотеке пока нет книг')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Книга удалена');
    expect(reachGoal).toHaveBeenCalledExactlyOnceWith('book_deleted');
  });
});
