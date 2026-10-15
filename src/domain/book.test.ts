import { describe, expect, it } from 'vitest';
import { emptyBook, filterBooks, normalizeBook, validateBook } from './book';
import { seedBooks } from '../data/mockRepository';

const valid = { ...emptyBook, title: 'Книга', author: 'Автор' };
describe('Book validation and search', () => {
  it.each([
    ['title', 200], ['author', 120], ['notes', 1000],
  ] as const)('accepts %s boundary and rejects the next UTF-16 unit', (field, limit) => {
    expect(validateBook({ ...valid, [field]: 'я'.repeat(limit) })[field]).toBeUndefined();
    expect(validateBook({ ...valid, [field]: 'я'.repeat(limit + 1) })[field]).toBeDefined();
  });
  it('counts non-BMP text as UTF-16 units and normalizes blank notes to null', () => {
    expect(validateBook({ ...valid, title: '📚'.repeat(100) })).toEqual({});
    expect(validateBook({ ...valid, title: '📚'.repeat(101) }).title).toBeDefined();
    expect(normalizeBook({ ...valid, notes: '  ' }).notes).toBeNull();
  });
  it.each([0, 6, 1.5, NaN])('rejects rating %s', rating => {
    expect(validateBook({ ...valid, status: 'finished', rating }).rating).toBeDefined();
  });
  it.each([null, 1, 5])('accepts finished rating %s', rating => {
    expect(validateBook({ ...valid, status: 'finished', rating })).toEqual({});
  });
  it('rejects an unknown status and a rating on an unfinished book', () => {
    expect(validateBook({ ...valid, status: 'unknown' as typeof valid.status }).status).toBeDefined();
    expect(validateBook({ ...valid, rating: 5 }).rating).toBeDefined();
  });
  it('combines normalized author/title search with status and falls back for unknown filters', () => {
    expect(filterBooks(seedBooks, ' БУЛГАКОВ ', 'reading')).toEqual([seedBooks[0]]);
    expect(filterBooks(seedBooks, 'мастер', 'finished')).toEqual([]);
    expect(filterBooks(seedBooks, '  ', 'broken')).toHaveLength(3);
    expect(filterBooks(seedBooks, 'е', 'all')).not.toEqual(filterBooks(seedBooks, 'ё', 'all'));
  });
});
