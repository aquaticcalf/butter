import { eq } from "drizzle-orm"
import type { Db } from "./db"
import { sessionEntries } from "./schema"
import type { SessionEntry, SessionKey, SessionSource } from "./types"

function serializeOrigin(origin: SessionSource | null): string | null {
  return origin ? JSON.stringify(origin) : null
}

function deserializeOrigin(raw: string | null): SessionSource | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionSource
  } catch {
    return null
  }
}

export interface UpsertEntryData {
  sessionKey: SessionKey
  sessionId: string
  chatType: SessionEntry["chatType"]
  origin?: SessionSource | null
}

export function createEntriesApi(db: Db) {
  function upsert(data: UpsertEntryData) {
    const now = new Date()
    const existing = db
      .select()
      .from(sessionEntries)
      .where(eq(sessionEntries.sessionKey, data.sessionKey))
      .get()

    if (existing) {
      const updates: Record<string, unknown> = {
        updatedAt: now,
        sessionId: data.sessionId,
        chatType: data.chatType,
      }
      if (data.origin !== undefined) {
        updates.origin = serializeOrigin(data.origin)
      }
      db.update(sessionEntries)
        .set(updates)
        .where(eq(sessionEntries.sessionKey, data.sessionKey))
        .run()
    } else {
      const row: typeof sessionEntries.$inferInsert = {
        sessionKey: data.sessionKey,
        sessionId: data.sessionId,
        chatType: data.chatType,
        createdAt: now,
        updatedAt: now,
        origin: serializeOrigin(data.origin ?? null),
      }
      db.insert(sessionEntries).values(row).run()
    }
  }

  function findByKey(sessionKey: SessionKey) {
    const row = db
      .select()
      .from(sessionEntries)
      .where(eq(sessionEntries.sessionKey, sessionKey))
      .get()

    if (!row) return null

    return {
      ...row,
      origin: deserializeOrigin(row.origin),
    } as SessionEntry
  }

  function list() {
    const rows = db.select().from(sessionEntries).all()
    return rows.map((row) => ({
      ...row,
      origin: deserializeOrigin(row.origin),
    })) as SessionEntry[]
  }

  function update(sessionKey: SessionKey, data: Partial<SessionEntry>) {
    const values: Record<string, unknown> = {}
    if (data.origin !== undefined) {
      values.origin = serializeOrigin(data.origin)
    }
    for (const key of [
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheWriteTokens",
      "totalTokens",
      "estimatedCostUsd",
      "costStatus",
      "lastPromptTokens",
      "wasAutoReset",
      "autoResetReason",
      "resetHadActivity",
      "isFreshReset",
      "expiryFinalized",
      "suspended",
      "resumePending",
      "resumeReason",
      "lastResumeMarkedAt",
    ] as const) {
      if (data[key] !== undefined) {
        values[key] = data[key]
      }
    }
    if (Object.keys(values).length > 0) {
      values.updatedAt = new Date()
      db.update(sessionEntries).set(values).where(eq(sessionEntries.sessionKey, sessionKey)).run()
    }
  }

  function markResumePending(sessionKey: SessionKey, reason: string) {
    db.update(sessionEntries)
      .set({
        resumePending: true,
        resumeReason: reason,
        lastResumeMarkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessionEntries.sessionKey, sessionKey))
      .run()
  }

  function finalizeExpiry(sessionKey: SessionKey) {
    db.update(sessionEntries)
      .set({ expiryFinalized: true, updatedAt: new Date() })
      .where(eq(sessionEntries.sessionKey, sessionKey))
      .run()
  }

  function recordAutoReset(
    sessionKey: SessionKey,
    reason: "idle" | "daily",
    hadActivity: boolean,
    newSessionId: string,
  ) {
    db.update(sessionEntries)
      .set({
        wasAutoReset: true,
        autoResetReason: reason,
        resetHadActivity: hadActivity,
        isFreshReset: true,
        sessionId: newSessionId,
        updatedAt: new Date(),
      })
      .where(eq(sessionEntries.sessionKey, sessionKey))
      .run()
  }

  function updateTokens(
    sessionKey: SessionKey,
    tokens: {
      inputTokens?: number
      outputTokens?: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
      totalTokens?: number
      lastPromptTokens?: number
    },
  ) {
    const values: Record<string, unknown> = { updatedAt: new Date() }
    for (const [key, value] of Object.entries(tokens)) {
      if (value !== undefined) {
        values[key] = value
      }
    }
    db.update(sessionEntries).set(values).where(eq(sessionEntries.sessionKey, sessionKey)).run()
  }

  function remove(sessionKey: SessionKey) {
    db.delete(sessionEntries).where(eq(sessionEntries.sessionKey, sessionKey)).run()
  }

  return {
    upsert,
    findByKey,
    list,
    update,
    markResumePending,
    finalizeExpiry,
    recordAutoReset,
    updateTokens,
    delete: remove,
  }
}
