export type ChatType = "dm" | "group" | "channel" | "forum"

export interface SessionSource {
  chatId: string
  chatName: string | null
  chatType: ChatType
  userId: string | null
  userName: string | null
  threadId: string | null
  messageId: string | null
}

export type SessionKey = string

export interface SessionEntry {
  sessionKey: SessionKey
  sessionId: string
  createdAt: Date
  updatedAt: Date
  origin: SessionSource | null
  chatType: ChatType
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  estimatedCostUsd: number
  costStatus: "unknown" | "estimated" | "actual"
  lastPromptTokens: number
  wasAutoReset: boolean
  autoResetReason: "idle" | "daily" | null
  resetHadActivity: boolean
  isFreshReset: boolean
  expiryFinalized: boolean
  suspended: boolean
  resumePending: boolean
  resumeReason: string | null
  lastResumeMarkedAt: Date | null
}

export interface SessionRow {
  id: string
  userId: string | null
  model: string | null
  modelConfig: string | null
  systemPrompt: string | null
  parentSessionId: string | null
  startedAt: number
  endedAt: number | null
  endReason: string | null
  messageCount: number
  toolCallCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  estimatedCostUsd: number | null
  actualCostUsd: number | null
  costStatus: string | null
  pricingVersion: string | null
  title: string | null
  apiCallCount: number
  rewindCount: number
  archived: boolean
}

export interface MessageRow {
  id: number
  sessionId: string
  role: "user" | "assistant" | "tool" | "system" | "session_meta"
  content: string | null
  toolCallId: string | null
  toolCalls: string | null
  toolName: string | null
  timestamp: number
  tokenCount: number | null
  finishReason: "stop" | "tool_calls" | "length" | null
  reasoning: string | null
  reasoningContent: string | null
  reasoningDetails: string | null
  platformMessageId: string | null
  observed: boolean
  active: boolean
}
