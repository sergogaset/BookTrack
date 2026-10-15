import type { Book, BookInput } from '../domain/book';

export type Database = {
  public: {
    Tables: {
      books: {
        Row: { [Field in keyof Book]: Book[Field] };
        Insert: { [Field in keyof BookInput]: BookInput[Field] };
        Update: { [Field in keyof BookInput]?: BookInput[Field] };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
