import type { Bot } from "grammy"
import type { RawMessage } from "chat"

export async function sendPhoto(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  photo: string | Buffer,
  options?: {
    caption?: string
    parseMode?: "HTML" | "MarkdownV2"
    replyMarkup?: Record<string, unknown>
    messageThreadId?: number
    disableLinkPreview?: boolean
  },
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(threadId)
  const result = await bot.api.sendPhoto(chatId, photo, {
    caption: options?.caption,
    parse_mode: options?.parseMode,
    reply_markup: options?.replyMarkup as never,
    message_thread_id: options?.messageThreadId,
    has_spoiler: false,
  })
  return {
    id: String(result.message_id),
    threadId,
    raw: result as unknown as object,
  }
}

export async function sendDocument(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  document: string | Buffer,
  options?: {
    caption?: string
    parseMode?: "HTML" | "MarkdownV2"
    replyMarkup?: Record<string, unknown>
    messageThreadId?: number
    filename?: string
  },
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(threadId)
  const result = await bot.api.sendDocument(chatId, document, {
    caption: options?.caption,
    parse_mode: options?.parseMode,
    reply_markup: options?.replyMarkup as never,
    message_thread_id: options?.messageThreadId,
  })
  return {
    id: String(result.message_id),
    threadId,
    raw: result as unknown as object,
  }
}

export async function sendVoice(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  voice: string | Buffer,
  options?: {
    caption?: string
    parseMode?: "HTML" | "MarkdownV2"
    messageThreadId?: number
  },
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(threadId)
  const result = await bot.api.sendVoice(chatId, voice, {
    caption: options?.caption,
    parse_mode: options?.parseMode,
    message_thread_id: options?.messageThreadId,
  })
  return {
    id: String(result.message_id),
    threadId,
    raw: result as unknown as object,
  }
}

export async function sendMediaGroup(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  media: {
    type: "photo" | "video"
    media: string
    caption?: string
    parseMode?: "HTML" | "MarkdownV2"
  }[],
): Promise<RawMessage<object>[]> {
  const chatId = decodeThreadId(threadId)
  const inputMedia = media.map((m) => ({
    type: m.type,
    media: m.media,
    caption: m.caption,
    parse_mode: m.parseMode,
  }))
  const results = await bot.api.sendMediaGroup(chatId, inputMedia)
  return results.map((r) => ({
    id: String(r.message_id),
    threadId,
    raw: r as unknown as object,
  }))
}

export async function sendPoll(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  question: string,
  options: string[],
  pollType?: "quiz" | "regular",
  correctOptionId?: number,
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(threadId)
  const result = await bot.api.sendPoll(chatId, question, options, {
    type: pollType,
    correct_option_id: correctOptionId,
    is_anonymous: true,
  })
  return {
    id: String(result.message_id),
    threadId,
    raw: result as unknown as object,
  }
}

export async function sendDice(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  emoji?: "🎲" | "🎯" | "🏀" | "⚽" | "🎳" | "🎰",
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(threadId)
  const result = await bot.api.sendDice(chatId, {
    emoji: emoji ?? "🎲",
  })
  return {
    id: String(result.message_id),
    threadId,
    raw: result as unknown as object,
  }
}
