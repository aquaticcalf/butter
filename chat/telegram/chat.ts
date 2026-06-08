import type { Bot } from "grammy"
import type { ThreadInfo, ChannelVisibility, FetchResult, FetchOptions, Message } from "chat"

export async function fetchThread(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
): Promise<ThreadInfo> {
  const chatId = decodeThreadId(threadId)
  try {
    const chat = await bot.api.getChat(chatId)
    return {
      id: threadId,
      channelId: threadId,
      isDM: chat.type === "private",
      channelVisibility: mapChatTypeToVisibility(chat.type),
      metadata: {
        type: chat.type,
        title: (chat as unknown as Record<string, unknown>).title,
        username: (chat as unknown as Record<string, unknown>).username,
      },
    }
  } catch {
    return {
      id: threadId,
      channelId: threadId,
      isDM: false,
      channelVisibility: "unknown",
      metadata: {},
    }
  }
}

export async function fetchChannelInfo(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  channelId: string,
): Promise<{
  id: string
  name?: string
  isDM?: boolean
  metadata: Record<string, unknown>
  channelVisibility?: ChannelVisibility
}> {
  const chatId = decodeThreadId(channelId)
  try {
    const chat = await bot.api.getChat(chatId)
    return {
      id: channelId,
      name:
        ((chat as unknown as Record<string, unknown>).title as string) ??
        ((chat as unknown as Record<string, unknown>).first_name as string),
      isDM: chat.type === "private",
      channelVisibility: mapChatTypeToVisibility(chat.type),
      metadata: {
        type: chat.type,
        username: (chat as unknown as Record<string, unknown>).username,
        description: (chat as unknown as Record<string, unknown>).description,
        inviteLink: (chat as unknown as Record<string, unknown>).invite_link,
      },
    }
  } catch {
    return {
      id: channelId,
      metadata: {},
    }
  }
}

export async function fetchMessages(
  bot: Bot,
  parseMessage: (raw: object) => Message<object>,
  options?: FetchOptions,
): Promise<FetchResult<object>> {
  const limit = options?.limit ?? 50

  try {
    const getUpdatesParams: Record<string, unknown> = {
      limit: Math.min(limit, 100),
      allowed_updates: ["message"],
    }
    if (options?.cursor) {
      getUpdatesParams.offset = Number(options.cursor)
    }
    const result = await bot.api.getUpdates(getUpdatesParams as never)

    const messages = result
      .filter((u) => u.message)
      .map((u) => parseMessage(u.message! as unknown as object))

    const lastUpdate = result[result.length - 1]
    const nextCursor = lastUpdate ? String(lastUpdate.update_id + 1) : undefined

    const fetchResult: { messages: Message<object>[]; nextCursor?: string } = { messages }
    if (nextCursor !== undefined) {
      fetchResult.nextCursor = nextCursor
    }
    return fetchResult
  } catch {
    return { messages: [] }
  }
}

export async function fetchMessage(
  bot: Bot,
  parseMessage: (raw: object) => Message<object>,
  _threadId: string,
  messageId: string,
): Promise<Message<object> | null> {
  try {
    const msgs = await bot.api.getUpdates({
      limit: 100,
      allowed_updates: ["message"],
    })

    for (const update of msgs) {
      if (update.message && String(update.message.message_id) === messageId) {
        return parseMessage(update.message as unknown as object)
      }
    }

    return null
  } catch {
    return null
  }
}

export async function getUser(
  bot: Bot,
  userId: string,
): Promise<{ userId: string; userName: string; fullName: string; isBot: boolean } | null> {
  try {
    const chat = await bot.api.getChat(Number(userId))
    return {
      userId: String(chat.id),
      userName: ((chat as unknown as Record<string, unknown>).username as string) ?? "",
      fullName: ((chat as unknown as Record<string, unknown>).first_name as string) ?? "",
      isBot: false,
    }
  } catch {
    return null
  }
}

export function openDM(encodeThreadId: (id: number) => string, userId: string): string {
  return encodeThreadId(Number(userId))
}

export async function getChatAdministrators(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
): Promise<
  {
    user: { id: number; username?: string; first_name: string; last_name?: string }
    status: string
  }[]
> {
  const chatId = decodeThreadId(threadId)
  try {
    const admins = await bot.api.getChatAdministrators(chatId)
    return admins.map((a) => {
      const user: { id: number; username?: string; first_name: string; last_name?: string } = {
        id: a.user.id,
        first_name: a.user.first_name,
      }
      if (a.user.username !== undefined) user.username = a.user.username
      if (a.user.last_name !== undefined) user.last_name = a.user.last_name
      return { user, status: a.status }
    })
  } catch {
    return []
  }
}

export async function getChatMemberCount(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
): Promise<number> {
  const chatId = decodeThreadId(threadId)
  try {
    return await bot.api.getChatMemberCount(chatId)
  } catch {
    return 0
  }
}

export async function startTyping(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  _status?: string,
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.sendChatAction(chatId, "typing")
  } catch {}
}

export async function sendChatAction(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  action:
    | "typing"
    | "upload_photo"
    | "record_video"
    | "upload_video"
    | "record_voice"
    | "upload_voice"
    | "upload_document"
    | "find_location"
    | "record_video_note"
    | "upload_video_note",
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.sendChatAction(chatId, action)
  } catch {}
}

function mapChatTypeToVisibility(chatType: string): ChannelVisibility {
  switch (chatType) {
    case "private":
      return "private"
    case "group":
    case "supergroup":
      return "workspace"
    case "channel":
      return "external"
    default:
      return "unknown"
  }
}
