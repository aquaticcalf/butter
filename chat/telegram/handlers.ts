import { Context } from "grammy"
import type { Bot } from "grammy"
import type { MessageEntity } from "grammy/types"
import { Message, type ChatInstance, type Attachment } from "chat"
import type { TelegramEntity } from "./converter"
import type { TelegramAdapterConfig, ClarifyState, ConversationEntry } from "./types"
import * as callback from "./callback"

interface HandlerDeps {
  bot: Bot
  chatInstanceRef: { current: ChatInstance | undefined }
  encodeThreadId: (id: number) => string
  decodeThreadId: (id: string) => number
  parseMessage: (raw: object, text?: string, entities?: TelegramEntity[]) => Message<object>
  parseAuthor: (from?: Record<string, unknown>) => {
    userId: string
    userName: string
    fullName: string
    isBot: boolean | "unknown"
    isMe: boolean
  }
  mediaGroupEvents: Map<string, { events: object[]; timer: ReturnType<typeof setTimeout> }>
  mediaGroupDebounceMs: number
  config: TelegramAdapterConfig
  botUsernameRef: { current: string }
  clarifyStates: Map<string, ClarifyState>
  conversationEntries: Map<string, ConversationEntry>
  sendErrorAlert: (error: unknown, context?: string) => Promise<void>
  startTypingPeriodic: (chatId: number, threadId?: number) => void
  stopTypingPeriodic: (chatId: number) => void
}

function compileMentionPatterns(patterns?: string[]): RegExp[] {
  if (!patterns || patterns.length === 0) return []
  return patterns.map((p) => {
    try {
      return new RegExp(p, "i")
    } catch {
      return /^$/
    }
  })
}

function compileForwardFilter(pattern?: string): RegExp | null {
  if (!pattern) return null
  try {
    return new RegExp(pattern, "i")
  } catch {
    return null
  }
}

export function registerHandlers(deps: HandlerDeps): void {
  const {
    bot,
    chatInstanceRef,
    encodeThreadId,
    parseMessage,
    parseAuthor,
    mediaGroupEvents,
    mediaGroupDebounceMs,
    config,
    botUsernameRef,
    clarifyStates,
    conversationEntries,
    sendErrorAlert,
    startTypingPeriodic,
    stopTypingPeriodic,
  } = deps

  const mentionPatterns = compileMentionPatterns(config.mentionPatterns)
  const forwardFilter = compileForwardFilter(config.observeForwardFilter)

  const allowedChatTypes = config.allowedChatTypes
  const allowedGroupIds = config.allowedGroupIds
  const ignoredThreadIds = new Set((config.ignoredThreadIds ?? []).map(String))
  const allowedTopicIds = new Set((config.allowedTopicIds ?? []).map(String))

  function isChatTypeAllowed(chatType: string): boolean {
    if (!allowedChatTypes || allowedChatTypes.length === 0) return true
    return allowedChatTypes.includes(chatType)
  }

  function isGroupAllowed(chatId: number | string): boolean {
    if (!allowedGroupIds || allowedGroupIds.length === 0) return true
    return allowedGroupIds.map(String).includes(String(chatId))
  }

  function isThreadIgnored(threadId: string): boolean {
    return ignoredThreadIds.has(threadId)
  }

  function isTopicAllowed(topicId?: number): boolean {
    if (!allowedTopicIds || allowedTopicIds.size === 0) return true
    if (topicId === undefined) return true
    return allowedTopicIds.has(String(topicId))
  }

  function checkMention(text: string, entities?: MessageEntity[]): boolean {
    const un = botUsernameRef.current
    if (!un) return false
    if (text.includes(`@${un}`)) return true
    if (entities) {
      for (const entity of entities) {
        if (entity.type === "mention") {
          const mention = text.slice(entity.offset, entity.offset + entity.length)
          if (mention === `@${un}`) return true
        }
      }
    }
    return false
  }

  function checkMentionPatterns(text: string): boolean {
    if (mentionPatterns.length === 0) return false
    return mentionPatterns.some((p) => p.test(text))
  }

  function matchesForwardFilter(text?: string): boolean {
    if (!forwardFilter || !text) return false
    return forwardFilter.test(text)
  }

  function isGroupChat(chatType: string): boolean {
    return chatType === "group" || chatType === "supergroup"
  }

  function getChatTypeFromCtx(ctx: Context): string {
    if (ctx.message?.chat?.type) return ctx.message.chat.type
    if (ctx.channelPost?.chat?.type) return ctx.channelPost.chat.type
    if (ctx.editedMessage?.chat?.type) return ctx.editedMessage.chat.type
    if (ctx.callbackQuery?.message?.chat?.type) return ctx.callbackQuery.message.chat.type
    return "private"
  }

  function getChatIdFromCtx(ctx: Context): number | undefined {
    if (ctx.message?.chat?.id) return ctx.message.chat.id
    if (ctx.channelPost?.chat?.id) return ctx.channelPost.chat.id
    if (ctx.editedMessage?.chat?.id) return ctx.editedMessage.chat.id
    if (ctx.callbackQuery?.message?.chat?.id) return ctx.callbackQuery.message.chat.id
    return undefined
  }

  function isAuthorizedUser(ctx: Context): boolean {
    const chatType = getChatTypeFromCtx(ctx)
    const chatId = getChatIdFromCtx(ctx)

    if (!isChatTypeAllowed(chatType)) {
      return false
    }

    if (chatId !== undefined && !isGroupAllowed(chatId)) {
      return false
    }

    if (chatType === "private") {
      if (!config.guestMode) {
        return false
      }
    }

    return true
  }

  function getMessageThreadId(ctx: Context): number | undefined {
    if (ctx.message?.is_topic_message && ctx.message?.message_thread_id) {
      return ctx.message.message_thread_id
    }
    if (ctx.channelPost?.is_topic_message && ctx.channelPost?.message_thread_id) {
      return ctx.channelPost.message_thread_id
    }
    return undefined
  }

  bot.command("start", async (ctx) => {
    if (!chatInstanceRef.current) return
    try {
      const chatId = ctx.message?.chat.id
      if (!chatId) return
      const threadId = encodeThreadId(chatId)
      const payload = ctx.match ?? ""
      const text = `👋 Hello! I am ${botUsernameRef.current || "a Telegram bot"}.\n\nSend me a message and I'll help you out.\n\n${payload ? `Payload: ${payload}` : ""}`

      if (chatInstanceRef.current.processMessage) {
        const msg = new Message({
          id: String(ctx.message?.message_id ?? 0),
          threadId,
          text,
          formatted: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", value: text }],
              },
            ],
          },
          raw: ctx.message ?? {},
          author: parseAuthor(ctx.message?.from as Record<string, unknown> | undefined),
          metadata: { dateSent: new Date(), edited: false },
          attachments: [],
          isMention: false,
          links: [],
        } as never)

        await chatInstanceRef.current.processMessage(undefined as never, threadId, msg)
      }
    } catch (err) {
      await sendErrorAlert(err, "Error in /start handler")
    }
  })

  bot.command("help", async (ctx) => {
    if (!chatInstanceRef.current) return
    try {
      const chatId = ctx.message?.chat.id
      if (!chatId) return
      const threadId = encodeThreadId(chatId)
      const text = `*Available Commands*\n\n/start - Start the bot\n/help - Show this help message\n/settings - Show your settings\n/setlang - Change language`

      const msg = new Message({
        id: String(ctx.message?.message_id ?? 0),
        threadId,
        text,
        formatted: {
          type: "root",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: text }],
            },
          ],
        },
        raw: ctx.message ?? {},
        author: parseAuthor(ctx.message?.from as Record<string, unknown> | undefined),
        metadata: { dateSent: new Date(), edited: false },
        attachments: [],
        isMention: false,
        links: [],
      } as never)

      await chatInstanceRef.current.processMessage(undefined as never, threadId, msg)
    } catch (err) {
      await sendErrorAlert(err, "Error in /help handler")
    }
  })

  bot.command("settings", async (ctx) => {
    if (!chatInstanceRef.current) return
    try {
      const chatId = ctx.message?.chat.id
      if (!chatId) return
      const threadId = encodeThreadId(chatId)
      const userId = String(ctx.message?.from?.id ?? "")
      const text = `*Settings*\n\nUser ID: ${userId}\nChat ID: ${chatId}\n\nConfigure settings via environment variables.`

      const msg = new Message({
        id: String(ctx.message?.message_id ?? 0),
        threadId,
        text,
        formatted: {
          type: "root",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: text }],
            },
          ],
        },
        raw: ctx.message ?? {},
        author: parseAuthor(ctx.message?.from as Record<string, unknown> | undefined),
        metadata: { dateSent: new Date(), edited: false },
        attachments: [],
        isMention: false,
        links: [],
      } as never)

      await chatInstanceRef.current.processMessage(undefined as never, threadId, msg)
    } catch (err) {
      await sendErrorAlert(err, "Error in /settings handler")
    }
  })

  bot.command("setlang", async (ctx) => {
    if (!chatInstanceRef.current) return
    try {
      const chatId = ctx.message?.chat.id
      if (!chatId) return
      const threadId = encodeThreadId(chatId)
      const text = `Language selection is configured via environment variables.\n\nSet LANG or LANGUAGE env to change the bot's language.`

      const msg = new Message({
        id: String(ctx.message?.message_id ?? 0),
        threadId,
        text,
        formatted: {
          type: "root",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: text }],
            },
          ],
        },
        raw: ctx.message ?? {},
        author: parseAuthor(ctx.message?.from as Record<string, unknown> | undefined),
        metadata: { dateSent: new Date(), edited: false },
        attachments: [],
        isMention: false,
        links: [],
      } as never)

      await chatInstanceRef.current.processMessage(undefined as never, threadId, msg)
    } catch (err) {
      await sendErrorAlert(err, "Error in /setlang handler")
    }
  })

  bot.on("message:text", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    const chatType = getChatTypeFromCtx(ctx)
    const chatId = getChatIdFromCtx(ctx)
    const threadId = encodeThreadId(chatId ?? 0)

    if (isThreadIgnored(String(chatId))) return

    if (!isChatTypeAllowed(chatType)) return

    if (chatId !== undefined && !isGroupAllowed(chatId)) return

    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return

    if (ctx.message.forward_origin) {
      const text = ctx.message.text ?? ""
      if (matchesForwardFilter(text)) return
      const raw = ctx.message as unknown as object
      const message = parseMessage(
        raw,
        text,
        ctx.message.entities as unknown as TelegramEntity[] | undefined,
      )
      message.metadata = { ...message.metadata, forwarded: true } as never
      await chatInstanceRef.current.processMessage(undefined as never, threadId, message)
      return
    }

    if (isGroupChat(chatType)) {
      if (config.requireMention ?? true) {
        const mentioned = checkMention(ctx.message.text ?? "", ctx.message.entities)
        const patternMatch = checkMentionPatterns(ctx.message.text ?? "")
        if (!mentioned && !patternMatch) {
          if (!config.observeUnmentionedGroupMessages) return
        }
      }
    }

    if (chatType === "private" && !config.guestMode) {
      return
    }

    startTypingPeriodic(chatId ?? 0, topicId)

    try {
      await handleMessageEvent(ctx, ctx.message.text ?? "", ctx.message.entities)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  function handleForwardedMedia(ctx: Context): boolean {
    const msg = ctx.message as Record<string, unknown> | undefined
    if (!msg?.forward_origin) return false
    const text = (msg.text as string) ?? (msg.caption as string) ?? ""
    if (matchesForwardFilter(text)) return true
    const raw = ctx.message as unknown as object
    const message = parseMessage(raw, text, msg.entities as unknown as TelegramEntity[] | undefined)
    message.metadata = { ...message.metadata, forwarded: true } as never
    const threadId = encodeThreadId(ctx.message!.chat.id)
    chatInstanceRef.current!.processMessage(undefined as never, threadId, message)
    return true
  }

  bot.on("message:photo", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const chatId = getChatIdFromCtx(ctx)
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    startTypingPeriodic(chatId ?? 0, topicId)
    try {
      await handleMediaGroupOrSingle(ctx)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  bot.on("message:document", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current || !ctx.message.document) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const chatId = getChatIdFromCtx(ctx)
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    startTypingPeriodic(chatId ?? 0, topicId)
    try {
      await handleMediaGroupOrSingle(ctx)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  bot.on("message:voice", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const chatId = getChatIdFromCtx(ctx)
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    startTypingPeriodic(chatId ?? 0, topicId)
    try {
      await handleSingleMedia(ctx)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  bot.on("message:audio", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const chatId = getChatIdFromCtx(ctx)
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    startTypingPeriodic(chatId ?? 0, topicId)
    try {
      await handleSingleMedia(ctx)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  bot.on("message:video", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const chatId = getChatIdFromCtx(ctx)
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    startTypingPeriodic(chatId ?? 0, topicId)
    try {
      await handleMediaGroupOrSingle(ctx)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  bot.on("message:video_note", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const chatId = getChatIdFromCtx(ctx)
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    startTypingPeriodic(chatId ?? 0, topicId)
    try {
      await handleSingleMedia(ctx)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  bot.on("message:animation", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const chatId = getChatIdFromCtx(ctx)
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    startTypingPeriodic(chatId ?? 0, topicId)
    try {
      await handleSingleMedia(ctx)
    } finally {
      stopTypingPeriodic(chatId ?? 0)
    }
  })

  bot.on("message:sticker", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!isAuthorizedUser(ctx)) return
    if (handleForwardedMedia(ctx)) return
    const topicId = getMessageThreadId(ctx)
    if (!isTopicAllowed(topicId)) return
    await handleSingleMedia(ctx)
  })

  bot.on("channel_post", async (ctx) => {
    if (!ctx.channelPost || !chatInstanceRef.current) return
    const raw = ctx.channelPost as unknown as object
    const message = parseMessage(raw)
    const threadId = encodeThreadId(ctx.channelPost.chat.id)
    await chatInstanceRef.current.processMessage(undefined as never, threadId, message)
  })

  bot.on("edited_message", async (ctx) => {
    if (!ctx.editedMessage || !chatInstanceRef.current) return
    const raw = ctx.editedMessage as unknown as object
    const message = parseMessage(raw)
    message.metadata.edited = true
    message.metadata.editedAt = new Date()
    const threadId = encodeThreadId(ctx.editedMessage.chat.id)
    await chatInstanceRef.current.processMessage(undefined as never, threadId, message)
  })

  bot.on("callback_query:data", async (ctx) => {
    if (!ctx.callbackQuery || !chatInstanceRef.current) return
    await handleCallbackQuery(ctx)
  })

  bot.on("my_chat_member", async (_ctx) => {})

  bot.on("message", async (ctx) => {
    if (!ctx.message || !chatInstanceRef.current) return
    if (!ctx.message.forward_origin) return

    if (ctx.message.text) return
    if (ctx.message.photo) return
    if (ctx.message.document) return
    if (ctx.message.voice) return
    if (ctx.message.audio) return
    if (ctx.message.video) return
    if (ctx.message.video_note) return
    if (ctx.message.animation) return
    if (ctx.message.sticker) return

    const text = ctx.message.text ?? ctx.message.caption ?? ""

    if (matchesForwardFilter(text)) return

    const raw = ctx.message as unknown as object
    const message = parseMessage(
      raw,
      text,
      ctx.message.entities as unknown as TelegramEntity[] | undefined,
    )
    message.metadata = { ...message.metadata, forwarded: true } as never
    const threadId = encodeThreadId(ctx.message.chat.id)
    await chatInstanceRef.current.processMessage(undefined as never, threadId, message)
  })

  async function handleMessageEvent(
    ctx: Context,
    text: string,
    entities?: MessageEntity[],
  ): Promise<void> {
    if (!ctx.message || !chatInstanceRef.current) return

    const raw = ctx.message as unknown as object
    const message = parseMessage(raw, text, entities as unknown as TelegramEntity[] | undefined)

    let effectiveThreadId = encodeThreadId(ctx.message.chat.id)
    const topicId = getMessageThreadId(ctx)
    if (topicId !== undefined) {
      const topicThreadId = encodeThreadId(
        Number(`${ctx.message.chat.id}${String(topicId).padStart(10, "0")}`),
      )
      effectiveThreadId = topicThreadId
    }

    await chatInstanceRef.current.processMessage(undefined as never, effectiveThreadId, message)
  }

  async function handleSingleMedia(ctx: Context): Promise<void> {
    if (!chatInstanceRef.current) return

    const raw = ctx.message as unknown as object
    const message = parseMessage(raw)
    const threadId = encodeThreadId(ctx.message!.chat.id)

    await chatInstanceRef.current.processMessage(undefined as never, threadId, message)
  }

  async function handleMediaGroupOrSingle(ctx: Context): Promise<void> {
    if (!chatInstanceRef.current || !ctx.message) return

    const msg = ctx.message as unknown as Record<string, unknown>
    const mediaGroupId = msg.media_group_id as string | undefined

    if (!mediaGroupId) {
      await handleSingleMedia(ctx)
      return
    }

    const raw = ctx.message as unknown as object
    const existing = mediaGroupEvents.get(mediaGroupId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.events.push(raw)
    } else {
      mediaGroupEvents.set(mediaGroupId, { events: [raw], timer: setTimeout(() => {}, 0) })
    }

    const timer = setTimeout(async () => {
      const group = mediaGroupEvents.get(mediaGroupId)
      if (!group) return
      mediaGroupEvents.delete(mediaGroupId)

      const merged = mergeMediaGroupEvents(group.events)
      const threadId = encodeThreadId(ctx.message!.chat.id)
      if (merged && chatInstanceRef.current) {
        await chatInstanceRef.current.processMessage(undefined as never, threadId, merged)
      }
    }, mediaGroupDebounceMs)

    mediaGroupEvents.set(mediaGroupId, {
      events: existing?.events ?? [raw],
      timer,
    })
  }

  function mergeMediaGroupEvents(events: object[]): Message<object> | null {
    if (events.length === 0) return null
    const first = parseMessage(events[0]!)
    const attachments: Attachment[] = [...first.attachments]

    let mergedCaption = first.text || ""

    for (let i = 1; i < events.length; i++) {
      const next = parseMessage(events[i]!)
      attachments.push(...next.attachments)

      if (next.text && !mergedCaption.includes(next.text)) {
        mergedCaption = mergedCaption ? `${mergedCaption}\n\n${next.text}` : next.text
      }
    }

    return new Message({
      ...first,
      text: mergedCaption,
      attachments,
      raw: events,
    } as never)
  }

  async function handleCallbackQuery(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery) return
    if (chatInstanceRef.current) {
      const cq = ctx.callbackQuery as unknown as Record<string, unknown>
      const from = cq.from as Record<string, unknown> | undefined
      const message = cq.message as Record<string, unknown> | undefined
      const chat = message?.chat as Record<string, unknown> | undefined
      const data = cq.data as string | undefined

      if (data?.startsWith("clarify:")) {
        const parts = data.split(":")
        if (parts.length >= 3) {
          const clarifyId = parts[1]!
          const choiceToken = parts.slice(2).join(":")
          const state = clarifyStates.get(clarifyId)

          if (!state) {
            await ctx.answerCallbackQuery({
              text: "This choice has expired or already been resolved.",
              show_alert: true,
            })
            return
          }

          if (state.resolved) {
            await ctx.answerCallbackQuery({ text: "Already resolved.", show_alert: true })
            return
          }

          const userId = String(from?.id ?? "")
          if (userId !== state.userId) {
            await ctx.answerCallbackQuery({ text: "⛔ Not authorized.", show_alert: true })
            return
          }

          if (chatInstanceRef.current) {
            const threadId = encodeThreadId(chat?.id as number)
            const messageId = String(message?.message_id as number)
            const text = `[Clarify choice: ${choiceToken}]`

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

            state.resolved = true

            if (choiceToken === "_other_") {
              const convKey = `${chat?.id}:${userId}`
              conversationEntries.set(convKey, {
                userId,
                threadId,
                chatId: chat?.id as number,
                command: "clarify_custom",
                step: 1,
                data: { clarifyId },
                createdAt: new Date(),
              })
            }

            await chatInstanceRef.current.processMessage(undefined as never, threadId, msg)
          }
        }
      } else if (data?.startsWith("admin:")) {
        const parts = data.split(":")
        if (parts.length >= 3) {
          const action = parts[1]
          const sessionId = parts[2]
          const userId = String(from?.id ?? "")

          const convKey = `admin:${sessionId}`
          conversationEntries.set(convKey, {
            userId,
            threadId: encodeThreadId(chat?.id as number),
            chatId: chat?.id as number,
            command: `admin_${action}`,
            step: 1,
            data: { sessionId, action },
            createdAt: new Date(),
          })

          const text = `[Admin ${action}: ${sessionId}]`

          const threadId = encodeThreadId(chat?.id as number)
          const messageId = String(message?.message_id as number)

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

          await chatInstanceRef.current.processMessage(undefined as never, threadId, msg)
        }
      } else {
        await callback.handleCallbackQueryRaw(
          bot,
          chatInstanceRef.current,
          encodeThreadId,
          parseAuthor,
          cq,
        )
      }
    }
    try {
      await ctx.answerCallbackQuery()
    } catch {}
  }
}
