import { useCallback, useEffect, useRef, useState } from 'react';
import { assertBooks, filterBooks, isBookStatus, sortBooks, statusLabels, type Book, type BookFilter, type BookInput } from './domain/book';
import type { BookRepository } from './data/bookRepository';
import { BackendError } from './data/backendError';
import { BookCard } from './components/BookCard';
import { BookForm } from './components/BookForm';
import { DeleteConfirmation } from './components/DeleteConfirmation';
import { analytics } from './analytics/metrika';

type Selection = { kind: 'create' } | { kind: 'edit' | 'delete'; book: Book } | null;

export function App({ repository }: { repository: BookRepository }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BookFilter>('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [notice, setNotice] = useState<{ text: string; hidden?: boolean } | null>(null);
  const [loadError, setLoadError] = useState('');
  const loadLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    if (loadLock.current) return;
    loadLock.current = true;
    setLoadState('loading');
    try {
      const result = await repository.list();
      assertBooks(result);
      setBooks(sortBooks(result));
      setLoadState('success');
    }
    catch (cause) { setLoadError(cause instanceof BackendError ? cause.message : 'Не удалось загрузить книги.'); setLoadState('error'); }
    finally { loadLock.current = false; }
  }, [repository]);
  useEffect(() => { void load(); }, [load]);
  const visible = filterBooks(books, query, filter);
  function reset() { setQuery(''); setFilter('all'); setNotice(null); }
  function select(kind: 'edit' | 'delete', id: string) {
    const book = books.find(item => item.id === id);
    if (book) { setNotice(null); setSelection({ kind, book }); }
  }
  async function save(input: BookInput) {
    if (!selection || selection.kind === 'delete') return;
    const book = selection.kind === 'edit'
      ? await repository.update(selection.book.id, input)
      : await repository.create(input);
    if (selection.kind === 'create') analytics.goal('book_created');
    if (book.status === 'finished' && (selection.kind === 'create' || selection.book.status !== 'finished')) analytics.goal('book_finished');
    setBooks(previous => sortBooks([...previous.filter(item => item.id !== book.id), book]));
    setNotice({ text: selection.kind === 'edit' ? 'Изменения сохранены.' : 'Книга добавлена.', hidden: filterBooks([book], query, filter).length === 0 });
    setSelection(null);
  }
  async function remove() {
    if (selection?.kind !== 'delete') return;
    await repository.remove(selection.book.id);
    analytics.goal('book_deleted');
    setBooks(previous => previous.filter(book => book.id !== selection.book.id));
    setNotice({ text: 'Книга удалена.' });
    setSelection(null);
    // The opener is removed with its card; place focus on the surviving library heading.
    requestAnimationFrame(() => heading.current?.focus());
  }
  return <>
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-4 py-7 sm:px-8 sm:py-9">
        <div><a href="#library" className="text-3xl font-bold tracking-tight"><span className="text-teal-700">Book</span>Track</a>
          <p className="mt-1 text-sm text-slate-600">Ваши книги. Ваш ритм чтения.</p></div>
        <button className="btn-primary w-full sm:w-auto" disabled={loadState !== 'success'} onClick={() => { setNotice(null); setSelection({ kind: 'create' }); }}>Добавить книгу</button>
      </div>
    </header>
    <main id="library" className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-2">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight">Моя библиотека</h1>
        <button className="text-sm font-medium text-teal-700 hover:underline" disabled={loadState === 'loading' || selection !== null} onClick={() => { setNotice(null); void load(); }}>Обновить список</button>
      </div>
      <div className="mb-8 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
        <div><label htmlFor="search">Поиск по библиотеке</label><input id="search" type="search" placeholder="Название или автор" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div><label htmlFor="filter">Статус чтения</label><select id="filter" value={filter} onChange={event => setFilter(isBookStatus(event.target.value) ? event.target.value : 'all')}>
          <option value="all">Все</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
      </div>
      {notice && <div role="status" className="mb-6 rounded-lg border border-teal-200 bg-teal-50 p-4 text-teal-900">
        {notice.text} {notice.hidden && <>Книга скрыта текущими условиями. <button className="font-semibold underline" onClick={reset}>Сбросить условия</button></>}
      </div>}
      {loadState === 'loading' && <div role="status" className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600">Загрузка библиотеки…</div>}
      {loadState === 'error' && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
        <p>{loadError}</p><button className="btn-secondary mt-4" onClick={() => void load()}>Повторить</button>
      </div>}
      {loadState === 'success' && (books.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
        <h2 className="text-xl font-semibold">В библиотеке пока нет книг</h2><p className="mb-5 mt-2 text-slate-600">Начните с книги, которую давно хотели прочитать.</p>
        <button className="btn-primary" onClick={() => setSelection({ kind: 'create' })}>Добавить первую книгу</button>
      </div> : visible.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <h2 className="text-xl font-semibold">Ничего не найдено</h2><p className="mt-2 text-slate-600">Попробуйте другое название, автора или статус.</p>
        <button className="btn-secondary mt-5" onClick={reset}>Сбросить условия</button>
      </div> : <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{visible.map(book => <BookCard key={book.id} book={book} onEdit={id => select('edit', id)} onDelete={id => select('delete', id)} />)}</div>)}
      <p className="mt-10 text-sm leading-relaxed text-slate-600">Личная библиотека · данные сохраняются в вашем аккаунте.</p>
    </main>
    {selection && (selection.kind === 'delete'
      ? <DeleteConfirmation book={selection.book} onDelete={remove} onCancel={() => setSelection(null)} />
      : <BookForm initialValues={selection.kind === 'edit' ? selection.book : undefined} onSave={save} onCancel={() => setSelection(null)} />)}
  </>;
}
