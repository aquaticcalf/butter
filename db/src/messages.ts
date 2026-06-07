import { eq, and, lt, asc, desc, count } from "drizzle-orm"
import type { Db } from "./db"
import { messages } from "./schema"
import type { MessageRow } from "./types"

export interface InsertMessageData {
  sessionId: string
  role: MessageRow["role"]
  content?: string | null
  toolCallId?: string | null
  toolCalls?: string | null
  toolName?: string | null
  timestamp?: number
  tokenCount?: number | null
  finishReason?: MessageRow["finishReason"]
  reasoning?: string | null
  reasoningContent?: string | null
  reasoningDetails?: string | null
  platformMessageId?: string | null
  observed?: boolean
  active?: boolean
}

export function createMessagesApi(db: Db) {
  function insert(data: InsertMessageData) {
    const row: typeof messages.$inferInsert = {
      sessionId: data.sessionId,
      role: data.role,
      content: data.content ?? null,
      toolCallId: data.toolCallId ?? null,
      toolCalls: data.toolCalls ?? null,
      toolName: data.toolName ?? null,
      timestamp: data.timestamp ?? Date.now(),
      tokenCount: data.tokenCount ?? null,
      finishReason: data.finishReason ?? null,
      reasoning: data.reasoning ?? null,
      reasoningContent: data.reasoningContent ?? null,
      reasoningDetails: data.reasoningDetails ?? null,
      platformMessageId: data.platformMessageId ?? null,
      observed: data.observed ?? false,
      active: data.active ?? true,
    }
    db.insert(messages).values(row).run()
  }

  function findById(id: number) {
    const row = db.select().from(messages).where(eq(messages.id, id)).get()
    return row ?? null
  }

  function getSessionMessages(sessionId: string) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.timestamp))
      .all()
  }

  function getActiveMessages(sessionId: string) {
    return db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), eq(messages.active, true)))
      .orderBy(asc(messages.timestamp))
      .all()
  }

  function update(id: number, data: Partial<Omit<MessageRow, "id">>) {
    const values: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      const col = (messages as unknown as Record<string, unknown>)[key]
      if (col) {
        values[key] = value
      }
    }
    if (Object.keys(values).length > 0) {
      db.update(messages).set(values).where(eq(messages.id, id)).run()
    }
  }

  function deactivateSessionMessages(sessionId: string, beforeId?: number) {
    const conditions = [eq(messages.sessionId, sessionId)]
    if (beforeId !== undefined) {
      conditions.push(lt(messages.id, beforeId))
    }
    db.update(messages)
      .set({ active: false })
      .where(and(...conditions))
      .run()
  }

  function remove(id: number) {
    db.delete(messages).where(eq(messages.id, id)).run()
  }

  function countInSession(sessionId: string) {
    const result = db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .get()
    return result?.value ?? 0
  }

  function lastMessage(sessionId: string) {
    const rows = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.timestamp))
      .limit(1)
      .all()
    return rows[0] ?? null
  }

  return {
    insert,
    findById,
    getSessionMessages,
    getActiveMessages,
    update,
    deactivateSessionMessages,
    delete: remove,
    countInSession,
    lastMessage,
  }
}
