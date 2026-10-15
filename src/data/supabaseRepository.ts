import type { SupabaseClient } from '@supabase/supabase-js';
import { assertBooks, normalizeBook, sortBooks, validateBook, type Book, type BookInput } from '../domain/book';
import type { BookRepository } from './bookRepository';
import type { Database } from './database.types';
import { BackendError, backendError } from './backendError';

export function createSupabaseRepository(client: SupabaseClient<Database>, userId: string, onSessionInvalid: () => void): BookRepository {
  function fail(cause: unknown, operation: 'list' | 'create' | 'update' | 'remove', status?: number): never {
    if (cause instanceof BackendError) throw cause;
    const error = backendError(cause, operation, status);
    if (error.category === 'unauthenticated') onSessionInvalid();
    throw error;
  }
  function validated(input: BookInput): BookInput {
    const value = normalizeBook(input);
    if (Object.keys(validateBook(value)).length) throw new BackendError('validation', 'Проверьте поля книги.');
    // Explicit allowlist: callers cannot smuggle owner, id or timestamps into writes.
    return { title: value.title, author: value.author, status: value.status, rating: value.rating, notes: value.notes };
  }
  async function authorization(operation: 'list' | 'create' | 'update' | 'remove') {
    const { data, error } = await client.auth.getSession();
    if (error) fail(error, operation);
    if (!data.session || data.session.user.id !== userId) fail({ code: 'PGRST301' }, operation);
    // Bind the request to this identity even if another tab switches accounts
    // while fetchWithAuth is awaiting the current session.
    return `Bearer ${data.session.access_token}`;
  }
  function checked(data: unknown): Book[] {
    assertBooks(data);
    if (data.some(book => book.user_id !== userId)) throw new Error('Invalid ownership in response');
    return data;
  }
  function one(data: unknown, expected: BookInput): Book {
    if (Array.isArray(data) && data.length === 0) throw new BackendError('unavailable', 'Книга недоступна. Закройте форму и обновите список.');
    const books = checked(data);
    if (books.length !== 1) throw new Error('Invalid mutation response');
    if ((Object.keys(expected) as (keyof BookInput)[]).some(field => books[0][field] !== expected[field])) throw new Error('Mutation response differs from submitted fields');
    return books[0];
  }
  return {
    async list() {
      try {
        // Fetch all pages: PostgREST normally caps each response at 1000 rows.
        const books: Book[] = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const token = await authorization('list');
          const { data, error, status } = await client.from('books').select('*').setHeader('Authorization', token).eq('user_id', userId)
            .order('created_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + pageSize - 1);
          if (error) fail(error, 'list', status);
          const page = checked(data);
          books.push(...page);
          if (page.length < pageSize) break;
        }
        assertBooks(books);
        return sortBooks(books);
      } catch (cause) { return fail(cause, 'list'); }
    },
    async create(input) {
      const value = validated(input);
      try {
        const token = await authorization('create');
        const { data, error, status } = await client.from('books').insert(value).setHeader('Authorization', token).select('*');
        if (error) fail(error, 'create', status);
        return one(data, value);
      } catch (cause) { return fail(cause, 'create'); }
    },
    async update(id, input) {
      const value = validated(input);
      try {
        const token = await authorization('update');
        const { data, error, status } = await client.from('books').update(value).setHeader('Authorization', token).eq('id', id).eq('user_id', userId).select('*');
        if (error) fail(error, 'update', status);
        const book = one(data, value);
        if (book.id !== id) throw new Error('Invalid mutation identity');
        return book;
      } catch (cause) { return fail(cause, 'update'); }
    },
    async remove(id) {
      try {
        const token = await authorization('remove');
        const { data, error, status } = await client.from('books').delete().setHeader('Authorization', token).eq('id', id).eq('user_id', userId).select('id');
        if (error) fail(error, 'remove', status);
        if (!data?.length) throw new BackendError('unavailable', 'Книга уже недоступна. Закройте диалог и обновите список.');
        if (data.length !== 1 || data[0].id !== id) throw new Error('Invalid delete response');
      } catch (cause) { fail(cause, 'remove'); }
    },
  };
}
