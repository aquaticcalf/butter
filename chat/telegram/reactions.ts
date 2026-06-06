import type { Bot } from "grammy"
import type { EmojiValue } from "chat"

export async function addReaction(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  messageId: string,
  emoji: EmojiValue | string,
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  const name = typeof emoji === "string" ? emoji : emoji.name
  const reaction = [{ type: "emoji" as const, emoji: name }]
  try {
    await bot.api.setMessageReaction(chatId, Number(messageId), reaction as never)
  } catch {}
}

export async function removeReaction(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  messageId: string,
  _emoji: EmojiValue | string,
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.setMessageReaction(chatId, Number(messageId), [])
  } catch {}
}
