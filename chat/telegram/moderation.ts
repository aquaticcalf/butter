import type { Bot } from "grammy"

export async function banChatMember(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  userId: number,
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.banChatMember(chatId, userId)
  } catch {}
}

export async function unbanChatMember(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  userId: number,
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.unbanChatMember(chatId, userId)
  } catch {}
}

export async function restrictChatMember(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  userId: number,
  permissions: {
    can_send_messages?: boolean
    can_send_media_messages?: boolean
    can_send_polls?: boolean
    can_send_other_messages?: boolean
    can_add_web_page_previews?: boolean
    can_change_info?: boolean
    can_invite_users?: boolean
    can_pin_messages?: boolean
  },
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    await bot.api.restrictChatMember(chatId, userId, permissions)
  } catch {}
}

export async function promoteChatMember(
  bot: Bot,
  decodeThreadId: (id: string) => number,
  threadId: string,
  userId: number,
  rights?: {
    can_change_info?: boolean
    can_post_messages?: boolean
    can_edit_messages?: boolean
    can_delete_messages?: boolean
    can_invite_users?: boolean
    can_restrict_members?: boolean
    can_pin_messages?: boolean
    can_promote_members?: boolean
    can_manage_chat?: boolean
    can_manage_topics?: boolean
  },
): Promise<void> {
  const chatId = decodeThreadId(threadId)
  try {
    const promoteParams: Record<string, unknown> = {
      is_anonymous: false,
    }
    if (rights?.can_change_info !== undefined) promoteParams.can_change_info = rights.can_change_info
    if (rights?.can_post_messages !== undefined) promoteParams.can_post_messages = rights.can_post_messages
    if (rights?.can_edit_messages !== undefined) promoteParams.can_edit_messages = rights.can_edit_messages
    if (rights?.can_delete_messages !== undefined) promoteParams.can_delete_messages = rights.can_delete_messages
    if (rights?.can_invite_users !== undefined) promoteParams.can_invite_users = rights.can_invite_users
    if (rights?.can_restrict_members !== undefined) promoteParams.can_restrict_members = rights.can_restrict_members
    if (rights?.can_pin_messages !== undefined) promoteParams.can_pin_messages = rights.can_pin_messages
    if (rights?.can_promote_members !== undefined) promoteParams.can_promote_members = rights.can_promote_members
    if (rights?.can_manage_chat !== undefined) promoteParams.can_manage_chat = rights.can_manage_chat
    if (rights?.can_manage_topics !== undefined) promoteParams.can_manage_topics = rights.can_manage_topics
    await bot.api.promoteChatMember(chatId, userId, promoteParams as never)
  } catch {}
}
