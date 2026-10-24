import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

/**
 * D1 gia cho test: SQLite trong bo nho, da ap toan bo migrations/.
 * Chi co phan API ma code dang dung: prepare/bind/all/first/run/batch.
 * BLOB tra ve dang mang so nhu D1 that.
 */

interface Counter {
  statements: number;
}

function toInput(value: unknown): SQLInputValue {
  if (value === undefined) throw new Error("D1 khong nhan undefined");
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as SQLInputValue;
}

function toOutput(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Uint8Array ? [...value] : value;
  }

  return out;
}

class TestStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly counter: Counter,
    private readonly sql: string,
    private readonly params: readonly unknown[] = []
  ) {}

  bind(...params: unknown[]): TestStatement {
    return new TestStatement(this.sqlite, this.counter, this.sql, params);
  }

  execute(): { results: Record<string, unknown>[]; changes: number } {
    const stmt = this.sqlite.prepare(this.sql);
    const params = this.params.map(toInput);

    if (stmt.columns().length > 0) {
      const rows = stmt.all(...params) as Record<string, unknown>[];
      return { results: rows.map(toOutput), changes: 0 };
    }

    const info = stmt.run(...params);
    return { results: [], changes: Number(info.changes) };
  }

  async all() {
    this.counter.statements += 1;
    const { results, changes } = this.execute();
    return { results, success: true, meta: { changes } };
  }

  async first(column?: string) {
    const { results } = await this.all();
    const row = results[0];
    if (!row) return null;
    return column === undefined ? row : (row[column] ?? null);
  }

  async run() {
    return this.all();
  }
}

export interface TestDatabase {
  db: D1Database;
  sqlite: DatabaseSync;
  counter: Counter;
}

export function openTestDatabase(): TestDatabase {
  const sqlite = new DatabaseSync(":memory:");
  const counter: Counter = { statements: 0 };
  const files = readdirSync(MIGRATIONS)
    .filter((name: string) => name.endsWith(".sql"))
    .sort();

  sqlite.exec("PRAGMA foreign_keys = ON");

  for (const file of files) {
    sqlite.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }

  const db = {
    prepare(sql: string) {
      return new TestStatement(sqlite, counter, sql);
    },
    async batch(statements: TestStatement[]) {
      counter.statements += statements.length;
      sqlite.exec("BEGIN");

      try {
        const results = statements.map((statement) => {
          const { results: rows, changes } = statement.execute();
          return { results: rows, success: true, meta: { changes } };
        });

        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };

  return { db: db as unknown as D1Database, sqlite, counter };
}
