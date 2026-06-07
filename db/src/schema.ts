import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  model: text("model"),
  modelConfig: text("model_config"),
  systemPrompt: text("system_prompt"),
  parentSessionId: text("parent_session_id"),
  startedAt: integer("started_at", { mode: "number" }).notNull(),
  endedAt: integer("ended_at", { mode: "number" }),
  endReason: text("end_reason"),
  messageCount: integer("message_count").notNull().default(0),
  toolCallCount: integer("tool_call_count").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  reasoningTokens: integer("reasoning_tokens").notNull().default(0),
  estimatedCostUsd: real("estimated_cost_usd"),
  actualCostUsd: real("actual_cost_usd"),
  costStatus: text("cost_status"),
  pricingVersion: text("pricing_version"),
  title: text("title"),
  apiCallCount: integer("api_call_count").notNull().default(0),
  rewindCount: integer("rewind_count").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
})

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role", { enum: ["user", "assistant", "tool", "system", "session_meta"] }).notNull(),
  content: text("content"),
  toolCallId: text("tool_call_id"),
  toolCalls: text("tool_calls"),
  toolName: text("tool_name"),
  timestamp: integer("timestamp", { mode: "number" }).notNull(),
  tokenCount: integer("token_count"),
  finishReason: text("finish_reason", { enum: ["stop", "tool_calls", "length"] }),
  reasoning: text("reasoning"),
  reasoningContent: text("reasoning_content"),
  reasoningDetails: text("reasoning_details"),
  platformMessageId: text("platform_message_id"),
  observed: integer("observed", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
})

export const sessionEntries = sqliteTable("session_entries", {
  sessionKey: text("session_key").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  origin: text("origin"),
  chatType: text("chat_type", { enum: ["dm", "group", "channel", "forum"] }).notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
  costStatus: text("cost_status", { enum: ["unknown", "estimated", "actual"] })
    .notNull()
    .default("unknown"),
  lastPromptTokens: integer("last_prompt_tokens").notNull().default(0),
  wasAutoReset: integer("was_auto_reset", { mode: "boolean" }).notNull().default(false),
  autoResetReason: text("auto_reset_reason", { enum: ["idle", "daily"] }),
  resetHadActivity: integer("reset_had_activity", { mode: "boolean" }).notNull().default(false),
  isFreshReset: integer("is_fresh_reset", { mode: "boolean" }).notNull().default(false),
  expiryFinalized: integer("expiry_finalized", { mode: "boolean" }).notNull().default(false),
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  resumePending: integer("resume_pending", { mode: "boolean" }).notNull().default(false),
  resumeReason: text("resume_reason"),
  lastResumeMarkedAt: integer("last_resume_marked_at", { mode: "timestamp" }),
})
