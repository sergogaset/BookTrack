import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseRepository } from './supabaseRepository';
import { seedBooks } from './mockRepository';
import type { Database } from './database.types';
import { emptyBook } from '../domain/book';

const book = seedBooks[0];
const input = { ...emptyBook, title: '  Книга  ', author: ' Автор ' };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function setup() {
  const fetcher = vi.fn<typeof fetch>();
  const invalid = vi.fn();
  const client = createClient<Database>('https://example.supabase.co', 'fake-public-test-key', {
    auth: { storageKey: crypto.randomUUID(), persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
  });
  const session = { access_token: 'fake-user-a-token', refresh_token: 'fake-refresh', expires_in: 3600, token_type: 'bearer', user: { id: book.user_id, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: book.created_at } };
  const getSession = vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session }, error: null });
  return { fetcher, invalid, getSession, session, repo: createSupabaseRepository(client, book.user_id, invalid) };
}
describe('Supabase repository with actual SDK and intercepted HTTP', () => {
  it('refuses a request after the active user has changed', async () => {
    const { repo, fetcher, invalid, getSession, session } = setup();
    getSession.mockResolvedValue({ data: { session: { ...session, user: { ...session.user, id: 'different-user' } } }, error: null });
    await expect(repo.create(input)).rejects.toMatchObject({ category: 'unauthenticated' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenCalledTimes(1);
  });
  it('keeps the original JWT when the SDK reads a newly switched session just before dispatch', async () => {
    const { repo, fetcher, getSession, session } = setup();
    getSession.mockResolvedValueOnce({ data: { session }, error: null }).mockResolvedValue({ data: { session: { ...session, access_token: 'fake-user-b-token', user: { ...session.user, id: 'different-user' } } }, error: null });
    fetcher.mockResolvedValue(reply([{ ...book, ...input, title: 'Книга', author: 'Автор' }], 201));
    await repo.create(input);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fake-user-a-token');
  });
  it('loads owned books with deterministic ordering and an owner filter', async () => {
    const { repo, fetcher } = setup();
    fetcher.mockResolvedValue(reply([book]));
    expect(await repo.list()).toEqual([book]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.pathname).toBe('/rest/v1/books');
    expect(url.searchParams.get('user_id')).toBe(`eq.${book.user_id}`);
    expect(url.searchParams.get('order')).toBe('created_at.desc,id.asc');
  });
  it('creates normalized data and never sends injected identity fields', async () => {
    const { repo, fetcher } = setup();
    fetcher.mockResolvedValue(reply([{ ...book, ...input, title: 'Книга', author: 'Автор' }], 201));
    const result = await repo.create({ ...input, user_id: 'forged', id: 'forged' } as typeof input);
    expect(result.title).toBe('Книга');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ ...input, title: 'Книга', author: 'Автор' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('updates only the selected id and confirms delete by returned id', async () => {
    const { repo, fetcher } = setup();
    fetcher.mockResolvedValueOnce(reply([{ ...book, ...input, title: 'Книга', author: 'Автор', status: 'finished', rating: 5 }]));
    expect((await repo.update(book.id, { ...input, status: 'finished', rating: 5 })).rating).toBe(5);
    expect(fetcher.mock.calls[0][1]?.method).toBe('PATCH');
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('id')).toBe(`eq.${book.id}`);
    fetcher.mockResolvedValueOnce(reply([{ id: book.id }]));
    await repo.remove(book.id);
    expect(fetcher.mock.calls[1][1]?.method).toBe('DELETE');
  });
  it('rejects invalid fields before sending HTTP', async () => {
    const { repo, fetcher } = setup();
    await expect(repo.create({ ...input, title: '  ' })).rejects.toMatchObject({ category: 'validation' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed and foreign response rows; does not treat this as empty', async () => {
    const { repo, fetcher } = setup();
    fetcher.mockResolvedValueOnce(reply([{ ...book, status: 'invalid' }]));
    await expect(repo.list()).rejects.toMatchObject({ category: 'unexpected' });
    fetcher.mockResolvedValueOnce(reply([{ ...book, user_id: 'other-user' }]));
    await expect(repo.list()).rejects.toMatchObject({ category: 'unexpected' });
  });
  it('treats foreign/missing zero-row mutations as unavailable without an upsert', async () => {
    const { repo, fetcher } = setup();
    fetcher.mockImplementation(async () => reply([]));
    await expect(repo.update(book.id, input)).rejects.toMatchObject({ category: 'unavailable' });
    await expect(repo.remove(book.id)).rejects.toMatchObject({ category: 'unavailable' });
    expect(fetcher.mock.calls.every(call => call[1]?.method !== 'POST')).toBe(true);
  });
  it.each([[401, 'PGRST301', 'unauthenticated'], [403, '42501', 'unavailable'], [400, '23514', 'validation'], [500, 'XX000', 'unexpected']] as const)('maps HTTP %s/%s to safe error %s', async (status, code, category) => {
    const { repo, fetcher, invalid } = setup();
    fetcher.mockImplementation(async () => reply({ code, message: 'PRIVATE DATABASE DETAILS', details: 'secret' }, status));
    const error = await repo.create(input).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ category, needsReview: status === 500 });
    expect(String(error)).not.toContain('PRIVATE');
    expect(invalid).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
  it('marks a network write as uncertain and never automatically retries', async () => {
    const { repo, fetcher } = setup();
    fetcher.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(repo.create(input)).rejects.toMatchObject({ category: 'network', needsReview: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fetches the next page instead of silently searching only the first 500 books', async () => {
    const { repo, fetcher } = setup();
    const page = Array.from({ length: 500 }, (_, index) => ({ ...book, id: `fixture-${index}` }));
    fetcher.mockResolvedValueOnce(reply(page)).mockResolvedValueOnce(reply([{ ...book, id: 'last' }]));
    expect(await repo.list()).toHaveLength(501);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
