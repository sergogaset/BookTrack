import { normalizeBook, sortBooks, validateBook, type Book, type BookInput } from '../domain/book';
import { BookUnavailableError } from '../domain/errors';

export interface BookRepository {
  list(): Promise<Book[]>;
  create(input: BookInput): Promise<Book>;
  update(id: string, input: BookInput): Promise<Book>;
  remove(id: string): Promise<void>;
}
export type Operation = 'list' | 'create' | 'update' | 'remove';

export const seedBooks: Book[] = [
  { id: 'cafe0000-0000-4000-8000-000000000001', title: 'Мастер и Маргарита', author: 'Михаил Булгаков', status: 'reading', rating: null, notes: null, created_at: '2026-10-15T12:00:00.000Z', updated_at: '2026-10-15T12:00:00.000Z' },
  { id: 'cafe0000-0000-4000-8000-000000000002', title: 'Пикник на обочине', author: 'Аркадий и Борис Стругацкие', status: 'want_to_read', rating: null, notes: null, created_at: '2026-10-14T12:00:00.000Z', updated_at: '2026-10-14T12:00:00.000Z' },
  { id: 'cafe0000-0000-4000-8000-000000000003', title: 'Капитанская дочка', author: 'Александр Пушкин', status: 'finished', rating: null, notes: null, created_at: '2026-10-13T12:00:00.000Z', updated_at: '2026-10-13T12:00:00.000Z' },
];

// Every failure happens before mutation; tests control latency and one-shot failures.
export function createMockRepository(options: { initial?: Book[]; delayMs?: number } = {}) {
  let books = (options.initial ?? seedBooks).map(book => ({ ...book }));
  const failures = new Set<Operation>();
  async function wait(operation: Operation) {
    await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 450));
    if (failures.delete(operation)) throw new Error('Демонстрационный отказ до изменения данных. Повторите действие.');
  }
  function validated(input: BookInput) {
    const value = normalizeBook(input);
    if (Object.keys(validateBook(value)).length) throw new Error('Проверьте поля книги.');
    return value;
  }
  return {
    failNext(operation: Operation) { failures.add(operation); },
    async list() { await wait('list'); return sortBooks(books).map(book => ({ ...book })); },
    async create(input: BookInput) {
      const value = validated(input);
      await wait('create');
      const now = new Date().toISOString();
      const book = { ...value, id: crypto.randomUUID(), created_at: now, updated_at: now };
      books = [...books, book];
      return { ...book };
    },
    async update(id: string, input: BookInput) {
      const value = validated(input);
      await wait('update');
      const previous = books.find(book => book.id === id);
      if (!previous) throw new BookUnavailableError('Книга недоступна. Закройте форму и обновите список.');
      const book: Book = { ...previous, ...value, updated_at: new Date().toISOString() };
      books = books.map(item => item.id === id ? book : item);
      return { ...book };
    },
    async remove(id: string) {
      await wait('remove');
      if (!books.some(book => book.id === id)) throw new BookUnavailableError('Книга уже недоступна. Закройте диалог и обновите список.');
      books = books.filter(book => book.id !== id);
    },
  } satisfies BookRepository & { failNext(operation: Operation): void };
}
