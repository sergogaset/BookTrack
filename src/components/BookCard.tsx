import { statusLabels, type Book } from '../domain/book';

const badgeStyles = {
  want_to_read: 'bg-amber-50 text-amber-900',
  reading: 'bg-cyan-50 text-teal-800',
  finished: 'bg-green-50 text-green-800',
};
export function BookCard({ book, onEdit, onDelete }: {
  book: Book; onEdit(id: string): void; onDelete(id: string): void;
}) {
  return <article aria-labelledby={`book-${book.id}`} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <h3 id={`book-${book.id}`} className="break-words text-xl font-semibold leading-snug">{book.title}</h3>
    <p className="mt-2 break-words text-slate-600">{book.author}</p>
    <div className="mt-5"><span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${badgeStyles[book.status]}`}>{statusLabels[book.status]}</span></div>
    {book.status === 'finished' && book.rating !== null && <p className="mt-4 text-sm text-slate-700">Оценка: {book.rating} из 5</p>}
    {book.notes && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{book.notes}</p>}
    <div className="mt-auto pt-6"><div className="flex flex-wrap justify-between gap-x-3 border-t border-slate-200 pt-3">
      <button className="text-sm font-semibold text-teal-700 hover:underline" onClick={() => onEdit(book.id)} aria-label={`Редактировать «${book.title}»`}>Редактировать</button>
      <button className="text-sm font-medium text-red-700 hover:underline" onClick={() => onDelete(book.id)} aria-label={`Удалить «${book.title}»`}>Удалить</button>
    </div></div>
  </article>;
}
