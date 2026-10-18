import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type SqliteValue = string | number | bigint | null;
import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { getEnv } from "@/lib/env";

const SQLITE_MIGRATIONS = [
  { id: "001_bulk_jobs", file: "001_bulk_jobs.sql" },
  { id: "003_email_ledger", file: "003_email_ledger_sqlite.sql" },
  { id: "004_campaigns", file: "004_campaigns_sqlite.sql" },
] as const;

const POSTGRES_MIGRATIONS = [
  { id: "002_neon_postgres", file: "002_neon_postgres.sql" },
  { id: "003_email_ledger", file: "003_email_ledger.sql" },
  { id: "004_campaigns", file: "004_campaigns.sql" },
] as const;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement {
  get(...params: unknown[]): Promise<unknown>;
  all(...params: unknown[]): Promise<unknown[]>;
  run(...params: unknown[]): Promise<RunResult>;
}

export interface AppDatabase {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
}

let sqliteDatabase: DatabaseSync | null = null;
let sqlitePath: string | null = null;
let pool: Pool | null = null;
let postgresReady: Promise<void> | null = null;

const postgresEnabled = (): boolean => {
  if (process.env.VERCEL) {
    return true;
  }
  return Boolean(process.env.DATABASE_URL?.trim()) && !process.env.BULK_DB_PATH?.trim();
};

const toPostgresSql = (sql: string): string => {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
};

const wrapSqlite = (db: DatabaseSync): AppDatabase => ({
  prepare(sql: string): Statement {
    const statement = db.prepare(sql);
    return {
      get: async (...params: unknown[]) => statement.get(...(params as SqliteValue[])) ?? null,
      all: async (...params: unknown[]) => statement.all(...(params as SqliteValue[])),
      run: async (...params: unknown[]) => {
        const result = statement.run(...(params as SqliteValue[]));
        return {
          changes: Number(result.changes ?? 0),
          lastInsertRowid: Number(result.lastInsertRowid ?? 0),
        };
      },
    };
  },
  exec: async (sql: string) => {
    db.exec(sql);
  },
});

const applySqliteMigrations = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  for (const migration of SQLITE_MIGRATIONS) {
    const existing = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migration.id);
    if (existing) {
      continue;
    }

    const migrationSql = fs.readFileSync(path.join(process.cwd(), "db", "migrations", migration.file), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migrationSql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
};

const getSqlite = (): AppDatabase => {
  const filePath = getEnv().BULK_DB_PATH;
  if (sqliteDatabase && sqlitePath === filePath) {
    return wrapSqlite(sqliteDatabase);
  }

  if (sqliteDatabase) {
    sqliteDatabase.close();
    sqliteDatabase = null;
    sqlitePath = null;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = new DatabaseSync(filePath, {
    enableForeignKeyConstraints: true,
    timeout: 5000,
  });
  next.exec("PRAGMA foreign_keys = ON");
  next.exec("PRAGMA busy_timeout = 5000");
  applySqliteMigrations(next);
  sqliteDatabase = next;
  sqlitePath = filePath;
  return wrapSqlite(next);
};

const getPool = (): Pool => {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set.");
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
};

const ensurePostgres = async (): Promise<void> => {
  if (!postgresReady) {
    postgresReady = (async () => {
      const connectionString = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
      if (!connectionString) {
        throw new Error("DATABASE_URL is not set.");
      }
      const client = new Pool({ connectionString, max: 1 });
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
          );
        `);
        for (const migration of POSTGRES_MIGRATIONS) {
          const existing = await client.query("SELECT id FROM schema_migrations WHERE id = $1", [migration.id]);
          if (existing.rowCount) {
            continue;
          }
          const migrationSql = fs.readFileSync(path.join(process.cwd(), "db", "migrations", migration.file), "utf8");
          await client.query("BEGIN");
          try {
            await client.query(migrationSql);
            await client.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)", [
              migration.id,
              new Date().toISOString(),
            ]);
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        }
      } finally {
        await client.end();
      }
    })().catch((error: unknown) => {
      postgresReady = null;
      throw error;
    });
  }
  await postgresReady;
};

const wrapPostgres = (queryable: Pool | PoolClient): AppDatabase => ({
  prepare(sql: string): Statement {
    const text = toPostgresSql(sql);
    const query = async (params: unknown[]): Promise<QueryResultRow[]> => {
      const result = await queryable.query<QueryResultRow>(text, params);
      return result.rows;
    };
    return {
      get: async (...params: unknown[]) => (await query(params))[0] ?? null,
      all: async (...params: unknown[]) => query(params),
      run: async (...params: unknown[]) => {
        const result = await queryable.query<QueryResultRow>(text, params);
        const id = result.rows[0]?.id;
        return {
          changes: result.rowCount ?? 0,
          lastInsertRowid: typeof id === "number" || typeof id === "string" ? Number(id) : 0,
        };
      },
    };
  },
  exec: async (sql: string) => {
    const command = sql.trim().toUpperCase();
    if (command.startsWith("BEGIN")) {
      await queryable.query("BEGIN");
      return;
    }
    if (command.startsWith("COMMIT")) {
      await queryable.query("COMMIT");
      return;
    }
    if (command.startsWith("ROLLBACK")) {
      await queryable.query("ROLLBACK");
      return;
    }
    await queryable.query(sql);
  },
});

export const getDb = async (): Promise<AppDatabase> => {
  if (!postgresEnabled()) {
    return getSqlite();
  }
  await ensurePostgres();
  return wrapPostgres(getPool());
};

export const withTransaction = async <T>(fn: (db: AppDatabase) => Promise<T>): Promise<T> => {
  if (!postgresEnabled()) {
    const db = getSqlite();
    await db.exec("BEGIN IMMEDIATE");
    try {
      const value = await fn(db);
      await db.exec("COMMIT");
      return value;
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }

  await ensurePostgres();
  const client = await getPool().connect();
  const db = wrapPostgres(client);
  try {
    await client.query("BEGIN");
    const value = await fn(db);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (sqliteDatabase) {
    sqliteDatabase.close();
    sqliteDatabase = null;
    sqlitePath = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
    postgresReady = null;
  }
};
