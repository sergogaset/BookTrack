export const statusLabels = {
  want_to_read: 'Хочу прочитать',
  reading: 'Читаю',
  finished: 'Прочитано',
} as const;

export type BookStatus = keyof typeof statusLabels;
export type BookFilter = BookStatus | 'all';
export interface BookInput {
  title: string;
  author: string;
  status: BookStatus;
  rating: number | null;
  notes: string | null;
}
export interface Book extends BookInput {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}
export const emptyBook: BookInput = {
  title: '', author: '', status: 'want_to_read', rating: null, notes: null,
};
export type FieldErrors = Partial<Record<keyof BookInput, string>>;

export function isBookStatus(value: string): value is BookStatus {
  return Object.prototype.hasOwnProperty.call(statusLabels, value);
}

export function normalizeBook(input: BookInput): BookInput {
  return {
    title: input.title.trim(), author: input.author.trim(), status: input.status,
    rating: input.rating, notes: input.notes?.trim() || null,
  };
}

export function validateBook(input: BookInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.title || input.title.length > 200) errors.title = 'Введите название от 1 до 200 символов.';
  if (!input.author || input.author.length > 120) errors.author = 'Введите автора от 1 до 120 символов.';
  if (!isBookStatus(input.status)) errors.status = 'Выберите допустимый статус.';
  if ((input.notes?.length ?? 0) > 1000) errors.notes = 'Заметка должна содержать не более 1000 символов.';
  if (input.rating !== null && (input.status !== 'finished' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    errors.rating = 'Оценка — целое число от 1 до 5 только для прочитанной книги.';
  }
  return errors;
}

export function filterBooks(books: Book[], query: string, filter: string): Book[] {
  const search = query.trim().toLowerCase();
  return books.filter(book =>
    (!isBookStatus(filter) || book.status === filter) &&
    (book.title.toLowerCase().includes(search) || book.author.toLowerCase().includes(search)),
  );
}

export function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

export function assertBooks(value: unknown): asserts value is Book[] {
  if (!Array.isArray(value)) throw new Error('Некорректный список книг');
  const ids = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) throw new Error('Некорректная книга');
    const book = item as Record<string, unknown>;
    if (typeof book.id !== 'string' || !book.id || ids.has(book.id) ||
      typeof book.user_id !== 'string' || !book.user_id ||
      typeof book.title !== 'string' || typeof book.author !== 'string' ||
      typeof book.status !== 'string' || !isBookStatus(book.status) ||
      (book.rating !== null && typeof book.rating !== 'number') ||
      (book.notes !== null && typeof book.notes !== 'string') ||
      typeof book.created_at !== 'string' || !Number.isFinite(Date.parse(book.created_at)) ||
      typeof book.updated_at !== 'string' || !Number.isFinite(Date.parse(book.updated_at))) {
      throw new Error('Некорректная книга');
    }
    const input: BookInput = { title: book.title, author: book.author, status: book.status, rating: book.rating as number | null, notes: book.notes as string | null };
    if (Object.keys(validateBook(normalizeBook(input))).length) throw new Error('Некорректная книга');
    ids.add(book.id);
  }
}
