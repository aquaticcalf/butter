import type { Bot } from "grammy"
import type { ChatInstance } from "chat"
import { Message } from "chat"
import type { Author } from "chat"

export function isCallbackUserAuthorized(
  from?: Record<string, unknown>,
  message?: Record<string, unknown>,
  authorizedUserId?: string,
  allowedGroupIds?: (number | string)[],
): boolean {
  if (!from) return false

  const userId = String(from.id ?? "")

  if (authorizedUserId && userId === authorizedUserId) return true

  if (message) {
    const chat = message.chat as Record<string, unknown> | undefined
    if (chat) {
      const chatId = String(chat.id ?? "")
      const chatType = chat.type as string | undefined

      if (chatType === "private") {
        if (!authorizedUserId) return true
        return userId === authorizedUserId
      }

      if (chatType === "group" || chatType === "supergroup") {
        if (allowedGroupIds && allowedGroupIds.length > 0) {
          return allowedGroupIds.map(String).includes(chatId)
        }
        return true
      }

      if (chatType === "channel") {
        return true
      }
    }
  }

  return true
}

export async function handleCallbackQueryRaw(
  bot: Bot,
  chatInstance: ChatInstance,
  encodeThreadId: (id: number) => string,
  parseAuthor: (from?: Record<string, unknown>) => Author,
  cq: Record<string, unknown>,
): Promise<void> {
  const data = cq.data as string | undefined
  if (!data) return

  const message = cq.message as Record<string, unknown> | undefined
  if (!message) return

  const from = cq.from as Record<string, unknown> | undefined
  const chat = message.chat as Record<string, unknown> | undefined
  if (!chat) return

  const threadId = encodeThreadId(chat.id as number)
  const messageId = String(message.message_id as number)
  const text = `[Callback: ${data}]`

  const msg = new Message({
    id: messageId,
    threadId,
    text,
    formatted: {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: text }] }],
    },
    raw: cq,
    author: parseAuthor(from),
    metadata: { dateSent: new Date(), edited: false },
    attachments: [],
    isMention: false,
    links: [],
  } as never)

  await chatInstance.processMessage(undefined as never, threadId, msg)
}

export async function answerCallbackQuery(
  bot: Bot,
  callbackQueryId: string,
  options?: { text?: string; showAlert?: boolean; url?: string; cacheTime?: number },
): Promise<void> {
  try {
    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: options?.text,
      show_alert: options?.showAlert,
      url: options?.url,
      cache_time: options?.cacheTime,
    })
  } catch {}
}

export async function editMessageReplyMarkup(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  messageId: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.editMessageReplyMarkup(chatId, Number(messageId), {
      reply_markup: replyMarkup as never,
    })
  } catch {}
}
