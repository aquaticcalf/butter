import { type RawMessage, type AdapterPostableMessage, parseMarkdown } from "chat"
import { GrammyError, HttpError } from "grammy"
import type { Bot } from "grammy"
import { TelegramConverter } from "./converter"
import type { TelegramAdapterConfig, QueuedMessage } from "./types"
import { TELEGRAM_MESSAGE_MAX_LENGTH } from "./types"

export async function postMessage(
  bot: Bot,
  config: TelegramAdapterConfig,
  converter: TelegramConverter,
  decodeThreadId: (id: string) => number,
  encodeThreadId: (id: number) => string,
  pendingMessages: QueuedMessage[],
  startSender: () => void,
  threadId: string,
  message: AdapterPostableMessage,
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(threadId)
  return sendOrEditMessage(
    bot,
    config,
    converter,
    decodeThreadId,
    encodeThreadId,
    pendingMessages,
    startSender,
    chatId,
    message,
  )
}

export async function postChannelMessage(
  bot: Bot,
  config: TelegramAdapterConfig,
  converter: TelegramConverter,
  decodeThreadId: (id: string) => number,
  encodeThreadId: (id: number) => string,
  pendingMessages: QueuedMessage[],
  startSender: () => void,
  channelId: string,
  message: AdapterPostableMessage,
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(channelId)
  return sendOrEditMessage(
    bot,
    config,
    converter,
    decodeThreadId,
    encodeThreadId,
    pendingMessages,
    startSender,
    chatId,
    message,
  )
}

export async function editMessage(
  bot: Bot,
  config: TelegramAdapterConfig,
  converter: TelegramConverter,
  decodeThreadId: (id: string) => number,
  encodeThreadId: (id: number) => string,
  pendingMessages: QueuedMessage[],
  startSender: () => void,
  threadId: string,
  messageId: string,
  message: AdapterPostableMessage,
): Promise<RawMessage<object>> {
  const chatId = decodeThreadId(threadId)
  const { text, parseMode, keyboard, disableLinkPreview } = await prepareMessage(
    message,
    converter,
    config,
  )

  if (text.length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
    try {
      const editParams: Record<string, unknown> = {
        parse_mode: parseMode,
        reply_markup: keyboard,
      }
      if (disableLinkPreview) {
        editParams.link_preview_options = { is_disabled: true }
      }
      const result = await bot.api.editMessageText(chatId, Number(messageId), text, editParams as never)

      return {
        id: messageId,
        threadId,
        raw: result as unknown as object,
      }
    } catch (err) {
      if (isMessageNotModifiedError(err)) {
        return { id: messageId, threadId, raw: {} }
      }
      if (isTransientError(err)) {
        throw err
      }
    }
  }

  if (text.length > TELEGRAM_MESSAGE_MAX_LENGTH) {
    try {
      await bot.api.deleteMessage(chatId, Number(messageId))
    } catch {}
    return sendOrEditMessage(
      bot,
      config,
      converter,
      decodeThreadId,
      encodeThreadId,
      pendingMessages,
      startSender,
      chatId,
      message,
    )
  }

  try {
    await bot.api.deleteMessage(chatId, Number(messageId))
  } catch {}

  return sendOrEditMessage(
    bot,
    config,
    converter,
    decodeThreadId,
    encodeThreadId,
    pendingMessages,
    startSender,
    chatId,
    message,
  )
}

export async function deleteMessage(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  messageId: string,
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.deleteMessage(chatId, Number(messageId))
  } catch {}
}

export async function forwardMessage(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  encodeThreadId: (id: number) => string,
  fromThreadId: string,
  toThreadId: string,
  messageId: string,
): Promise<RawMessage<object>> {
  const fromChatId = decodeThreadId(fromThreadId)
  const toChatId = decodeThreadId(toThreadId)
  const result = await bot.api.forwardMessage(toChatId, fromChatId, Number(messageId))
  return {
    id: String(result.message_id),
    threadId: toThreadId,
    raw: result as unknown as object,
  }
}

export async function copyMessage(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  encodeThreadId: (id: number) => string,
  fromThreadId: string,
  toThreadId: string,
  messageId: string,
  options?: {
    caption?: string
    parseMode?: "HTML" | "MarkdownV2"
    replyMarkup?: Record<string, unknown>
  },
): Promise<RawMessage<object>> {
  const fromChatId = decodeThreadId(fromThreadId)
  const toChatId = decodeThreadId(toThreadId)
  const copyParams: Record<string, unknown> = {
    reply_markup: options?.replyMarkup,
  }
  if (options?.caption !== undefined) copyParams.caption = options.caption
  if (options?.parseMode !== undefined) copyParams.parse_mode = options.parseMode
  const result = await bot.api.copyMessage(toChatId, fromChatId, Number(messageId), copyParams as never)
  return {
    id: String(result.message_id),
    threadId: toThreadId,
    raw: result as unknown as object,
  }
}

async function sendOrEditMessage(
  bot: Bot,
  config: TelegramAdapterConfig,
  converter: TelegramConverter,
  decodeThreadId: (id: string) => number,
  encodeThreadId: (id: number) => string,
  pendingMessages: QueuedMessage[],
  startSender: () => void,
  chatId: number,
  message: AdapterPostableMessage,
  replyToMessageId?: number,
  messageThreadId?: number,
): Promise<RawMessage<object>> {
  const { text, parseMode, keyboard, disableLinkPreview } = await prepareMessage(
    message,
    converter,
    config,
  )

  const chunks = splitMessage(text, config.messageOverflowMaxLength)
  let lastResult: RawMessage<object> | null = null

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks.length > 1 ? `${chunks[i]!} (${i + 1}/${chunks.length})` : chunks[i]!

    const sendParams: Record<string, unknown> = {
      reply_markup: i === 0 ? keyboard : undefined,
      message_thread_id: messageThreadId,
      reply_to_message_id:
        i === 0 ? replyToMessageId : lastResult ? Number(lastResult.id) : undefined,
    }
    if (parseMode !== undefined) sendParams.parse_mode = parseMode
    if (disableLinkPreview) sendParams.link_preview_options = { is_disabled: true }
    const result = await bot.api.sendMessage(chatId, chunkText, sendParams as never)

    lastResult = {
      id: String(result.message_id),
      threadId: encodeThreadId(chatId),
      raw: result as unknown as object,
    }
  }

  return lastResult!
}

async function prepareMessage(
  message: AdapterPostableMessage,
  converter: TelegramConverter,
  config: TelegramAdapterConfig,
): Promise<{
  text: string
  parseMode: "HTML" | "MarkdownV2" | undefined
  keyboard: Record<string, unknown> | undefined
  disableLinkPreview: boolean | undefined
}> {
  let text = ""
  let parseMode: "HTML" | "MarkdownV2" | undefined
  let keyboard: Record<string, unknown> | undefined

  const disableLinkPreview = config.disableLinkPreviews

  if (typeof message === "string") {
    text = message
  } else if ("raw" in message) {
    text = message.raw
  } else if ("markdown" in message) {
    const ast = parseMarkdown(message.markdown)
    text = converter.fromAst(ast)
    parseMode = "HTML"
  } else if ("ast" in message) {
    text = converter.fromAst(message.ast)
    parseMode = "HTML"
  } else if ("card" in message || ("type" in message && message.type === "card")) {
    const card = "card" in message ? message.card : message
    if (card && "fallbackText" in card) {
      text = (card as { fallbackText?: string }).fallbackText ?? "..."
    } else {
      text = "..."
    }
  }

  const keyboardMatch = text.match(/<keyboard>([\s\S]*?)<\/keyboard>/)
  if (keyboardMatch) {
    text = text.replace(/<keyboard>[\s\S]*?<\/keyboard>/, "").trim()
    keyboard = parseKeyboardMarkup(keyboardMatch[1]!)
  }

  if (!parseMode) {
    if (containsHtmlTags(text)) {
      parseMode = "HTML"
    } else if (containsMarkdownV2(text)) {
      parseMode = "MarkdownV2"
    }
  }

  const result: { text: string; parseMode: "HTML" | "MarkdownV2" | undefined; keyboard: Record<string, unknown> | undefined; disableLinkPreview: boolean | undefined } = { text, parseMode, keyboard, disableLinkPreview }
  return result
}

function containsHtmlTags(text: string): boolean {
  return /<[a-z][a-z0-9]*>/i.test(text)
}

function containsMarkdownV2(text: string): boolean {
  return /[*_[\]()~`>#+\-=|{}.!]/.test(text)
}

function parseKeyboardMarkup(content: string): Record<string, unknown> | undefined {
  const rows = content.split("\n").filter((r) => r.trim())
  const inlineKeyboard: { text: string; callback_data: string }[][] = []

  for (const row of rows) {
    const buttons = row.split("|").filter((b) => b.trim())
    if (buttons.length === 0) continue

    const rowButtons = buttons.map((btn) => {
      const text = btn.trim()
      const callbackData = `btn:${text.slice(0, 64)}`
      return { text, callback_data: callbackData }
    })

    inlineKeyboard.push(rowButtons)
  }

  return inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
}

function splitMessage(text: string, overflowMaxLength?: number): string[] {
  const maxLen = overflowMaxLength ?? TELEGRAM_MESSAGE_MAX_LENGTH
  if (text.length <= maxLen) {
    return [text]
  }

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    let splitPos = remaining.lastIndexOf("\n", maxLen)
    if (splitPos < maxLen / 2) {
      splitPos = remaining.lastIndexOf(" ", maxLen)
    }
    if (splitPos < maxLen / 2) {
      splitPos = maxLen
    }

    chunks.push(remaining.slice(0, splitPos))
    remaining = remaining.slice(splitPos).trimStart()
  }

  return chunks
}

export function isMessageNotModifiedError(err: unknown): boolean {
  if (err instanceof GrammyError) {
    return err.description?.includes("message is not modified") ?? false
  }
  return false
}

export function isTransientError(err: unknown): boolean {
  if (err instanceof HttpError) return true
  if (err instanceof GrammyError) {
    const desc = err.description ?? ""
    return (
      desc.includes("Too Many Requests") ||
      desc.includes("retry after") ||
      desc.includes("connect error") ||
      desc.includes("connection error") ||
      desc.includes("timed out") ||
      desc.includes("temporarily unavailable")
    )
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("network") ||
      msg.includes("socket") ||
      msg.includes("temporarily unavailable")
    )
  }
  return false
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function processSenderQueue(
  bot: Bot,
  pendingMessages: QueuedMessage[],
  senderRunningRef: { value: boolean },
): void {
  const run = async () => {
    while (senderRunningRef.value) {
      const item = pendingMessages.shift()
      if (!item) {
        await sleep(100)
        continue
      }

      try {
        let result: { message_id: number }

        if (item.isEdit && item.editMessageId) {
          const editQueueParams: Record<string, unknown> = {
            parse_mode: item.parseMode,
            reply_markup: item.replyMarkup,
          }
          if (item.disableLinkPreview) editQueueParams.link_preview_options = { is_disabled: true }
          const r = await bot.api.editMessageText(item.chatId, item.editMessageId, item.text, editQueueParams as never)
          result = r as unknown as { message_id: number }
        } else {
          const sendQueueParams: Record<string, unknown> = {
            parse_mode: item.parseMode,
            reply_markup: item.replyMarkup,
            message_thread_id: item.messageThreadId,
            reply_to_message_id: item.replyToMessageId,
          }
          if (item.disableLinkPreview) sendQueueParams.link_preview_options = { is_disabled: true }
          const r = await bot.api.sendMessage(item.chatId, item.text, sendQueueParams as never)
          result = r as unknown as { message_id: number }
        }

        item.resolve({ messageId: result.message_id })
      } catch (err) {
        if (isMessageNotModifiedError(err)) {
          item.resolve({ messageId: item.editMessageId ?? 0 })
        } else if (isTransientError(err)) {
          pendingMessages.unshift(item)
          await sleep(1000)
        } else {
          item.reject(err)
        }
      }
    }
  }

  run()
}
