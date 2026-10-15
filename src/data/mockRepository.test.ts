import { describe, expect, it } from 'vitest';
import { createMockRepository, seedBooks } from './mockRepository';
import { emptyBook } from '../domain/book';

const input = { ...emptyBook, title: '  Новая книга ', author: ' Автор ' };
describe('Mock repository', () => {
  it('assigns UUID and UTC timestamps, permits duplicates, returns detached records', async () => {
    const repo = createMockRepository({ initial: [], delayMs: 0 });
    const first = await repo.create(input);
    const second = await repo.create(input);
    expect(first.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    expect(first.id).not.toBe(second.id);
    expect(first.created_at).toBe(first.updated_at);
    expect(first.created_at).toMatch(/Z$/);
    first.title = 'Mutation';
    expect((await repo.list())[0].title).toBe('Новая книга');
  });
  it('fails before mutation and allows retry; update preserves identity and creation time', async () => {
    const repo = createMockRepository({ delayMs: 0 });
    repo.failNext('create');
    await expect(repo.create(input)).rejects.toThrow();
    expect(await repo.list()).toHaveLength(3);
    const created = await repo.create(input);
    const changed = await repo.update(created.id, { ...input, status: 'reading' });
    expect(changed.id).toBe(created.id);
    expect(changed.created_at).toBe(created.created_at);
    expect(changed.updated_at >= created.updated_at).toBe(true);
    await expect(repo.update('missing', input)).rejects.toThrow('Книга недоступна');
    expect(await repo.list()).toHaveLength(4);
  });
  it('preserves records on rejected deletion and deletes only the selected id after retry', async () => {
    const repo = createMockRepository({ delayMs: 0 });
    repo.failNext('remove');
    await expect(repo.remove(seedBooks[0].id)).rejects.toThrow();
    expect(await repo.list()).toHaveLength(3);
    await repo.remove(seedBooks[0].id);
    expect((await repo.list()).map(book => book.id)).toEqual(seedBooks.slice(1).map(book => book.id));
    await expect(repo.remove(seedBooks[0].id)).rejects.toThrow('Книга уже недоступна');
  });
});
