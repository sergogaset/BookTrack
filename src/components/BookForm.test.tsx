import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BookForm } from './BookForm';
import { emptyBook } from '../domain/book';

async function fill() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Название'), '  Новая книга  ');
  await user.type(screen.getByLabelText('Автор'), '  Автор  ');
  return user;
}

describe('BookForm — T-02/T-03/T-09', () => {
  it('rejects blank required fields and focuses the first invalid field', async () => {
    const onSave = vi.fn();
    render(<BookForm onSave={onSave} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Название'), '   ');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Название')).toHaveFocus();
    expect(screen.getByLabelText('Автор')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Введите название от 1 до 200 символов.')).toBeVisible();
  });

  it('normalizes a valid input and blocks save/cancel until resolve', async () => {
    let resolve!: () => void;
    const onSave = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const onCancel = vi.fn();
    render(<BookForm onSave={onSave} onCancel={onCancel} />);
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ ...emptyBook, title: 'Новая книга', author: 'Автор' });
    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('retains input after rejection and allows successful retry', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    render(<BookForm onSave={onSave} onCancel={vi.fn()} />);
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить книгу');
    expect(screen.getByLabelText('Название')).toHaveValue('  Новая книга  ');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the rating when leaving finished and does not restore it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BookForm initialValues={{ ...emptyBook, title: 'Книга', author: 'Автор', status: 'finished', rating: 5 }} onSave={onSave} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Статус'), 'reading');
    expect(screen.getByRole('status')).toHaveTextContent('Оценка очищена');
    expect(screen.queryByLabelText('Оценка (необязательно)')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Статус'), 'finished');
    expect(screen.getByLabelText('Оценка (необязательно)')).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ rating: null }));
  });

  it('cancels without saving and restores the opener focus', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const view = render(<BookForm onSave={onSave} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
