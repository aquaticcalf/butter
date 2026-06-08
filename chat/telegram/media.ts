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
  const photoParams: Record<string, unknown> = {
    reply_markup: options?.replyMarkup,
    message_thread_id: options?.messageThreadId,
    has_spoiler: false,
  }
  if (options?.caption !== undefined) photoParams.caption = options.caption
  if (options?.parseMode !== undefined) photoParams.parse_mode = options.parseMode
  const result = await bot.api.sendPhoto(chatId, photo as any, photoParams as never)
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
  const docParams: Record<string, unknown> = {
    reply_markup: options?.replyMarkup,
    message_thread_id: options?.messageThreadId,
  }
  if (options?.caption !== undefined) docParams.caption = options.caption
  if (options?.parseMode !== undefined) docParams.parse_mode = options.parseMode
  const result = await bot.api.sendDocument(chatId, document as any, docParams as never)
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
  const voiceParams: Record<string, unknown> = {
    message_thread_id: options?.messageThreadId,
  }
  if (options?.caption !== undefined) voiceParams.caption = options.caption
  if (options?.parseMode !== undefined) voiceParams.parse_mode = options.parseMode
  const result = await bot.api.sendVoice(chatId, voice as any, voiceParams as never)
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
  })) as any
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
  const pollParams: Record<string, unknown> = {
    correct_option_ids: correctOptionId,
    is_anonymous: true,
  }
  if (pollType !== undefined) pollParams.type = pollType
  const result = await bot.api.sendPoll(chatId, question, options, pollParams as never)
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
  } as never)
  return {
    id: String(result.message_id),
    threadId,
    raw: result as unknown as object,
  }
}
