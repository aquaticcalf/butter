import type { Lock, QueueEntry, StateAdapter } from "chat/app"
import type Database from "better-sqlite3"

export function createDbState(sqlite: Database.Database): StateAdapter {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_state_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_state_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_state_subscriptions (
      thread_id TEXT PRIMARY KEY
    )
  `)

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_app_state_lists_key
      ON app_state_lists(list_key, created_at)
  `)

  const locks = new Map<string, Lock>()

  function pruneExpired() {
    const now = Date.now()
    sqlite
      .prepare("DELETE FROM app_state_kv WHERE expires_at IS NOT NULL AND expires_at <= ?")
      .run(now)
  }

  return {
    async connect() {},

    async disconnect() {},

    async acquireLock(threadId: string, ttlMs: number) {
      const existing = locks.get(threadId)
      if (existing && existing.expiresAt > Date.now()) return null
      const lock: Lock = {
        threadId,
        token: crypto.randomUUID(),
        expiresAt: Date.now() + ttlMs,
      }
      locks.set(threadId, lock)
      return lock
    },

    async extendLock(lock: Lock, ttlMs: number) {
      const existing = locks.get(lock.threadId)
      if (!existing || existing.token !== lock.token) return false
      existing.expiresAt = Date.now() + ttlMs
      return true
    },

    async releaseLock(lock: Lock) {
      const existing = locks.get(lock.threadId)
      if (existing?.token === lock.token) {
        locks.delete(lock.threadId)
      }
    },

    async forceReleaseLock(threadId: string) {
      locks.delete(threadId)
    },

    async set(key: string, value: unknown, ttlMs?: number) {
      const expiresAt = ttlMs ? Date.now() + ttlMs : null
      sqlite
        .prepare(
          "INSERT INTO app_state_kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
        )
        .run(key, JSON.stringify(value), expiresAt)
    },

    async get<T>(key: string) {
      pruneExpired()
      const row = sqlite.prepare("SELECT value FROM app_state_kv WHERE key = ?").get(key) as
        | { value: string }
        | undefined
      return row ? (JSON.parse(row.value) as T) : null
    },

    async delete(key: string) {
      sqlite.prepare("DELETE FROM app_state_kv WHERE key = ?").run(key)
    },

    async setIfNotExists(key: string, value: unknown, ttlMs?: number) {
      const expiresAt = ttlMs ? Date.now() + ttlMs : null
      try {
        sqlite
          .prepare("INSERT INTO app_state_kv (key, value, expires_at) VALUES (?, ?, ?)")
          .run(key, JSON.stringify(value), expiresAt)
        return true
      } catch {
        return false
      }
    },

    async appendToList(key: string, value: unknown) {
      sqlite
        .prepare("INSERT INTO app_state_lists (list_key, value, created_at) VALUES (?, ?, ?)")
        .run(key, JSON.stringify(value), Date.now())
    },

    async getList<T>(key: string) {
      const rows = sqlite
        .prepare("SELECT value FROM app_state_lists WHERE list_key = ? ORDER BY created_at ASC")
        .all(key) as { value: string }[]
      return rows.map((r) => JSON.parse(r.value) as T)
    },

    async enqueue(threadId: string, entry: QueueEntry, maxSize: number) {
      const now = Date.now()
      sqlite
        .prepare("INSERT INTO app_state_lists (list_key, value, created_at) VALUES (?, ?, ?)")
        .run(`queue:${threadId}`, JSON.stringify(entry), now)

      sqlite
        .prepare(
          `DELETE FROM app_state_lists WHERE id IN (
            SELECT id FROM app_state_lists WHERE list_key = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?
          )`,
        )
        .run(`queue:${threadId}`, maxSize)

      const count = sqlite
        .prepare("SELECT COUNT(*) as count FROM app_state_lists WHERE list_key = ?")
        .get(`queue:${threadId}`) as { count: number }
      return count.count
    },

    async dequeue(threadId: string) {
      const row = sqlite
        .prepare(
          "SELECT id, value FROM app_state_lists WHERE list_key = ? ORDER BY created_at ASC LIMIT 1",
        )
        .get(`queue:${threadId}`) as { id: number; value: string } | undefined

      if (!row) return null

      sqlite.prepare("DELETE FROM app_state_lists WHERE id = ?").run(row.id)
      return JSON.parse(row.value) as QueueEntry
    },

    async queueDepth(threadId: string) {
      const row = sqlite
        .prepare("SELECT COUNT(*) as count FROM app_state_lists WHERE list_key = ?")
        .get(`queue:${threadId}`) as { count: number }
      return row.count
    },

    async subscribe(threadId: string) {
      sqlite
        .prepare("INSERT OR IGNORE INTO app_state_subscriptions (thread_id) VALUES (?)")
        .run(threadId)
    },

    async unsubscribe(threadId: string) {
      sqlite.prepare("DELETE FROM app_state_subscriptions WHERE thread_id = ?").run(threadId)
    },

    async isSubscribed(threadId: string) {
      const row = sqlite
        .prepare("SELECT 1 FROM app_state_subscriptions WHERE thread_id = ?")
        .get(threadId)
      return !!row
    },
  }
}
