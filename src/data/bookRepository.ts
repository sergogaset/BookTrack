import type { Book, BookInput } from '../domain/book';

export interface BookRepository {
  list(): Promise<Book[]>;
  create(input: BookInput): Promise<Book>;
  update(id: string, input: BookInput): Promise<Book>;
  remove(id: string): Promise<void>;
}
