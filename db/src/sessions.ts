import { eq, desc, and } from "drizzle-orm"
import type { Db } from "./db"
import { sessions } from "./schema"
import type { SessionRow } from "./types"

export interface CreateSessionData {
  id: string
  userId?: string | null
  model?: string | null
  modelConfig?: string | null
  systemPrompt?: string | null
  parentSessionId?: string | null
  startedAt?: number
}

export interface ListSessionsOptions {
  limit?: number
  offset?: number
  archived?: boolean
}

export function createSessionsApi(db: Db) {
  function insert(data: CreateSessionData) {
    const row: typeof sessions.$inferInsert = {
      id: data.id,
      userId: data.userId ?? null,
      model: data.model ?? null,
      modelConfig: data.modelConfig ?? null,
      systemPrompt: data.systemPrompt ?? null,
      parentSessionId: data.parentSessionId ?? null,
      startedAt: data.startedAt ?? Date.now(),
    }
    db.insert(sessions).values(row).run()
    return row as unknown as SessionRow
  }

  function findById(id: string) {
    const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
    return row ?? null
  }

  function list(opts: ListSessionsOptions = {}) {
    const conditions = []
    if (opts.archived !== undefined) {
      conditions.push(eq(sessions.archived, opts.archived))
    }
    const query = db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.startedAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0)
    if (conditions.length > 0) {
      query.where(and(...conditions))
    }
    return query.all()
  }

  function update(id: string, data: Partial<Omit<SessionRow, "id">>) {
    const values: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      const col = (sessions as unknown as Record<string, unknown>)[key]
      if (col) {
        values[key] = value
      }
    }
    if (Object.keys(values).length > 0) {
      db.update(sessions).set(values).where(eq(sessions.id, id)).run()
    }
  }

  function archive(id: string) {
    db.update(sessions).set({ archived: true }).where(eq(sessions.id, id)).run()
  }

  function remove(id: string) {
    db.delete(sessions).where(eq(sessions.id, id)).run()
  }

  function count() {
    const result = db.select({ count: sessions.id }).from(sessions).all()
    return result.length
  }

  return { insert, findById, list, update, archive, delete: remove, count }
}
