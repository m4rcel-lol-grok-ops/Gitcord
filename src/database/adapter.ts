import Database, { Database as DatabaseType } from "better-sqlite3";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";

export interface DatabaseAdapter {
  query<T = unknown>(sql: string, params?: unknown[]): T[];
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  exec(sql: string): void;
  close(): void;
  transaction<T>(fn: () => T): T;
}

export class SqliteAdapter implements DatabaseAdapter {
  private db: DatabaseType;

  constructor(databasePath: string) {
    // If not in-memory, ensure parent directory exists
    if (databasePath !== ":memory:") {
      const dir = path.dirname(databasePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(databasePath);
    // Enable Write-Ahead Logging for concurrency and performance
    if (databasePath !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.pragma("foreign_keys = ON");
    logger.debug(`Sqlite database initialized at: ${databasePath}`);
  }

  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  get<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
    return this.db.prepare(sql).run(...params);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    return txn();
  }
}
