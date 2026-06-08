export interface TelegramAdapterConfig {
  token: string
  userName?: string

  webhookUrl?: string
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
  errorAlertChatId?: number | string

  maxDocumentBytes?: number
  proxyUrl?: string
  botName?: string
  botShortDescription?: string
  botDescription?: string

  persistThreadHistory?: boolean

  mediaGroupDebounceMs?: number
  messageOverflowMaxLength?: number
}

export type TelegramThreadId = number

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
  threadId: number | undefined
  timer: ReturnType<typeof setTimeout>
  active: boolean
}

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096

export const TELEGRAM_DEFAULT_MEDIA_GROUP_DEBOUNCE_MS = 300

export const TELEGRAM_DEFAULT_MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
