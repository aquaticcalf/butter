import type { Bot } from "grammy"

export async function createForumTopic(
  bot: Bot,
  chatId: number,
  name: string,
): Promise<number | null> {
  try {
    const result = await bot.api.createForumTopic(chatId, name)
    return result.message_thread_id
  } catch {
    return null
  }
}

export async function closeForumTopic(
  bot: Bot,
  chatId: number,
  messageThreadId: number,
): Promise<void> {
  try {
    await bot.api.closeForumTopic(chatId, messageThreadId)
  } catch {}
}

export async function reopenForumTopic(
  bot: Bot,
  chatId: number,
  messageThreadId: number,
): Promise<void> {
  try {
    await bot.api.reopenForumTopic(chatId, messageThreadId)
  } catch {}
}

export async function ensureDmTopic(
  bot: Bot,
  topicCache: Map<string, number>,
  chatId: number,
  topicName: string,
): Promise<number | null> {
  const cacheKey = `${chatId}:${topicName}`
  const cached = topicCache.get(cacheKey)
  if (cached !== undefined) return cached

  const topicId = await createForumTopic(bot, chatId, topicName)
  if (topicId !== null) {
    topicCache.set(cacheKey, topicId)
  }
  return topicId
}
