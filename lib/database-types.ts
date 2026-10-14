export type DatabaseResult<T> = {
  results: T[];
  success: boolean;
  meta: { changes: number };
};
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run(): Promise<DatabaseResult<Record<string, unknown>>>;
}
export interface RegistryDatabase {
  prepare(query: string): Statement;
  batch(
    statements: Statement[],
  ): Promise<DatabaseResult<Record<string, unknown>>[]>;
}
