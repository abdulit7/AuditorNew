import knex, { Knex } from 'knex';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config';

export function createDb(cfg: AppConfig): Knex {
  if (cfg.DB_CLIENT === 'mysql2') {
    return knex({
      client: 'mysql2',
      connection: {
        host: cfg.DB_HOST,
        port: cfg.DB_PORT,
        user: cfg.DB_USER,
        password: cfg.DB_PASSWORD,
        database: cfg.DB_NAME,
        charset: 'utf8mb4',
        timezone: 'Z',
        dateStrings: true,
      },
      pool: { min: 0, max: 10 },
    });
  }
  const file = cfg.SQLITE_FILE === ':memory:' ? ':memory:' : path.resolve(cfg.SQLITE_FILE);
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  return knex({
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done(null, conn);
      },
    },
  });
}

/** JSON columns come back parsed from MySQL and as text from SQLite. */
export function parseJson<T = any>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

export const toJson = (v: unknown) => JSON.stringify(v ?? null);
export const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
