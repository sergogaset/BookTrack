import type { Book } from '../domain/book';
import { Dialog } from './Dialog';
import { useAsyncAction } from '../hooks/useAsyncAction';

export function DeleteConfirmation({ book, onDelete, onCancel }: {
  book: Book; onDelete(): Promise<void>; onCancel(): void;
}) {
  const { pending, needsReview, error, run } = useAsyncAction('Не удалось удалить книгу. Повторите попытку или закройте диалог и обновите список, если книга уже недоступна.');
  return <Dialog title="Удалить книгу?" busy={pending} onClose={onCancel} initialFocus="[data-cancel]">
    <p className="break-words text-slate-700">«{book.title}» будет удалена из библиотеки.</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    <div className="mt-7 flex flex-wrap gap-3">
      <button data-cancel className="btn-secondary" disabled={pending} onClick={onCancel}>Отмена</button>
      <button className="btn-danger" disabled={pending || needsReview} onClick={() => void run(onDelete)}>{pending ? 'Удаление…' : 'Удалить'}</button>
    </div>
  </Dialog>;
}
