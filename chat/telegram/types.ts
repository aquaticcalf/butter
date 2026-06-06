export interface TelegramAdapterConfig {
  token: string
  userName?: string

  webhookUrl?: string
  webhookHost?: string
  webhookPort?: number
  webhookPath?: string
  webhookSecret?: string

  allowedUpdates?: string[]
  allowedChatTypes?: string[]
  allowedGroupIds?: (number | string)[]
  ignoredThreadIds?: (number | string)[]
  allowedTopicIds?: (number | string)[]
  guestMode?: boolean
  requireMention?: boolean
  mentionPatterns?: string[]
  disableLinkPreviews?: boolean
  observeUnmentionedGroupMessages?: boolean
  observeForwardFilter?: string
  unauthorizedDmBehavior?: "pair" | "ignore" | "reply_guide"
  errorAlertChatId?: number | string

  maxDocumentBytes?: number
  proxyUrl?: string
  botName?: string
  botShortDescription?: string
  botDescription?: string

  fallbackIps?: string[]

  persistThreadHistory?: boolean

  mediaGroupDebounceMs?: number
  messageOverflowMaxLength?: number
}

export type TelegramThreadId = number

export interface QueuedMessage {
  chatId: number
  text: string
  parseMode?: "HTML" | "MarkdownV2"
  replyToMessageId?: number
  messageThreadId?: number
  disableLinkPreview?: boolean
  replyMarkup?: Record<string, unknown>
  resolve: (result: { messageId: number }) => void
  reject: (error: unknown) => void
  isEdit?: boolean
  editMessageId?: number
}

export interface TelegramMediaResult {
  fileId: string
  filePath?: string
  mimeType?: string
  fileName?: string
  fileSize?: number
  duration?: number
  width?: number
  height?: number
}

export interface SendResult {
  success: boolean
  messageId?: number
  error?: unknown
  retryable?: boolean
}

export interface ClarifyState {
  messageId: string
  threadId: string
  userId: string
  choices: string[]
  resolved: boolean
  createdAt: Date
  ttl: number
}

export interface ConversationEntry {
  userId: string
  threadId: string
  chatId: number
  command: string
  step: number
  data: Record<string, unknown>
  createdAt: Date
}

export interface TypingState {
  chatId: number
  threadId?: number
  timer: ReturnType<typeof setTimeout>
  active: boolean
}

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096

export const TELEGRAM_DEFAULT_MEDIA_GROUP_DEBOUNCE_MS = 300

export const TELEGRAM_DEFAULT_MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

export const TELEGRAM_COMMAND_PREFIX = "/"
