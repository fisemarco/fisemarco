import postgres from "postgres";
import type { RegistryDatabase, Statement } from "./database-types";

type Binding = string | number | null;
type Result<T> = { results: T[]; success: true; meta: { changes: number } };
type Executor = (
  statements: { query: string; parameters: Binding[] }[],
) => Promise<Result<Record<string, unknown>>[]>;

import { postgresQuery } from "./postgres-query";
export class PgStatement {
  constructor(
    readonly execute: Executor,
    readonly query: string,
    readonly parameters: Binding[] = [],
  ) {}
  bind(...values: unknown[]) {
    if (
      values.some(
        (v) =>
          v !== null &&
          typeof v !== "string" &&
          !(typeof v === "number" && Number.isFinite(v)),
      )
    )
      throw Error("Unsupported database binding.");
    return new PgStatement(this.execute, this.query, values as Binding[]);
  }
  async all<T = Record<string, unknown>>(): Promise<Result<T>> {
    return (await this.execute([this]))[0] as Result<T>;
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }
  async run() {
    return this.all();
  }
}
export function postgresDatabase(url: string, ca?: string): RegistryDatabase {
  const endpoint = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(endpoint.protocol) ||
    !endpoint.password
  )
    throw Error(
      "A server PostgreSQL connection URL with credentials is required.",
    );
  const execute: Executor = async (statements) => {
    // One connection per operation prevents cross-request socket reuse in Workers.
    const sql = postgres(url, {
      ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 1,
      max_lifetime: 30,
      connection: {
        search_path: "ftai_private,pg_catalog",
        statement_timeout: 15000,
      },
      types: {
        numericCount: {
          to: 20,
          from: [20],
          serialize: String,
          parse: (value: string) => {
            const n = Number(value);
            if (!Number.isSafeInteger(n))
              throw Error("Database integer exceeds safe range.");
            return n;
          },
        },
      },
    });
    try {
      return await sql.begin("isolation level serializable", async (tx) => {
        const results: Result<Record<string, unknown>>[] = [];
        for (const statement of statements) {
          const rows = await tx.unsafe(
            postgresQuery(statement.query),
            statement.parameters,
          );
          results.push({
            results: [...rows],
            success: true,
            meta: { changes: rows.count },
          });
        }
        return results;
      });
    } finally {
      await sql.end({ timeout: 1 });
    }
  };
  return {
    prepare: (query: string) => new PgStatement(execute, query),
    batch: (statements: Statement[]) => {
      if (statements.some((s) => !(s instanceof PgStatement)))
        throw Error("Mixed database statements are not supported.");
      return execute(statements as PgStatement[]);
    },
  };
}
