import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

export type Db = BetterSQLite3Database<typeof schema>

export function createDb(dbPath: string): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}
