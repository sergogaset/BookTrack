import { useId, useRef, useState, type FormEvent } from 'react';
import { emptyBook, normalizeBook, statusLabels, validateBook, type BookInput, type BookStatus, type FieldErrors } from '../domain/book';
import { Dialog } from './Dialog';
import { useAsyncAction } from '../hooks/useAsyncAction';

export function BookForm({ initialValues, onSave, onCancel }: {
  initialValues?: BookInput; onSave(input: BookInput): Promise<void>; onCancel(): void;
}) {
  const [values, setValues] = useState<BookInput>(initialValues ?? emptyBook);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { pending, error: failure, run, clearError } = useAsyncAction('Не удалось сохранить книгу. Данные не изменены, введённые поля сохранены. Повторите попытку или закройте форму и обновите список.');
  const [ratingCleared, setRatingCleared] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const prefix = useId();
  const attrs = (field: keyof BookInput) => ({
    id: `${prefix}-${field}`, name: field,
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': errors[field] ? `${prefix}-${field}-error` : undefined,
  });
  const error = (field: keyof BookInput) => errors[field] &&
    <p id={`${prefix}-${field}-error`} className="field-error">{errors[field]}</p>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const input = normalizeBook(values);
    const nextErrors = validateBook(input);
    setErrors(nextErrors);
    clearError();
    const invalid = Object.keys(nextErrors)[0];
    if (invalid) { form.current?.querySelector<HTMLElement>(`[name="${invalid}"]`)?.focus(); return; }
    await run(() => onSave(input));
  }
  return <Dialog title={initialValues ? 'Редактировать книгу' : 'Добавить книгу'} busy={pending} onClose={onCancel}>
    <form ref={form} onSubmit={submit} noValidate>
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <div><label htmlFor={`${prefix}-title`}>Название</label>
          <input {...attrs('title')} required value={values.title} onChange={event => setValues({ ...values, title: event.target.value })} />{error('title')}
          <p className="mt-1 text-xs text-slate-600">Обязательное поле · до 200 символов</p></div>
        <div><label htmlFor={`${prefix}-author`}>Автор</label>
          <input {...attrs('author')} required value={values.author} onChange={event => setValues({ ...values, author: event.target.value })} />{error('author')}
          <p className="mt-1 text-xs text-slate-600">Обязательное поле · до 120 символов</p></div>
        <div><label htmlFor={`${prefix}-status`}>Статус</label>
          <select {...attrs('status')} value={values.status} onChange={event => {
            const status = event.target.value as BookStatus;
            if (values.status === 'finished' && status !== 'finished') setRatingCleared(true);
            setValues({ ...values, status, rating: status === 'finished' ? values.rating : null });
          }}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error('status')}
          {ratingCleared && <p role="status" className="mt-2 text-sm text-slate-600">Оценка очищена: она доступна только для прочитанных книг.</p>}</div>
        {values.status === 'finished' && <div><label htmlFor={`${prefix}-rating`}>Оценка (необязательно)</label>
          <input {...attrs('rating')} type="number" min="1" max="5" step="1" value={values.rating ?? ''} onChange={event => setValues({ ...values, rating: event.target.value === '' ? null : Number(event.target.value) })} />{error('rating')}</div>}
        <div><label htmlFor={`${prefix}-notes`}>Заметка (необязательно)</label>
          <textarea {...attrs('notes')} rows={3} value={values.notes ?? ''} onChange={event => setValues({ ...values, notes: event.target.value })} />{error('notes')}
          <p className="mt-1 text-xs text-slate-600">До 1000 символов</p></div>
      </fieldset>
      {failure && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Сохранение…' : 'Сохранить'}</button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={onCancel}>Отмена</button>
      </div>
    </form>
  </Dialog>;
}
