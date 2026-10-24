/**
 * Kieu toi thieu cho module Node ma test D1 gia dung.
 * Du an chay tren Workers nen khong cai @types/node (se lan bien toan cuc
 * cua Node vao code app). Neu sau nay cai @types/node thi xoa file nay.
 */

declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
  export function readdirSync(path: URL): string[];
}

declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    all(...params: SQLInputValue[]): unknown[];
    get(...params: SQLInputValue[]): unknown;
    run(...params: SQLInputValue[]): StatementResultingChanges;
    columns(): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
