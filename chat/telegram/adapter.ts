import {
  type Adapter,
  type ChatInstance,
  type Message,
  type RawMessage,
  type FetchResult,
  type FetchOptions,
  type AdapterPostableMessage,
  type FormattedContent,
  type Author,
  type EmojiValue,
  type ThreadInfo,
  type ChannelVisibility,
  type LockScope,
} from "chat"

import { Bot } from "grammy"
import type { Update } from "grammy/types"
import { TelegramConverter, type TelegramEntity } from "./converter"
import { startBot, stopBot } from "./polling"
import type {
  TelegramAdapterConfig,
  TelegramThreadId,
  ClarifyState,
  ConversationEntry,
  TypingState,
} from "./types"
import { TELEGRAM_DEFAULT_MEDIA_GROUP_DEBOUNCE_MS } from "./types"
import { createFallbackFetch } from "./network"

import * as messages from "./messages"
import * as media from "./media"
import * as reactions from "./reactions"
import * as chat from "./chat"
import * as moderation from "./moderation"
import * as forum from "./forum"
import * as commands from "./commands"
import * as callback from "./callback"
import { parseMessage, renderFormatted, type ParseCtx } from "./parse"
import { registerHandlers } from "./handlers"

export class TelegramAdapter implements Adapter<TelegramThreadId, object> {
  readonly name = "telegram"
  readonly userName: string
  readonly botUserId?: string
  readonly persistThreadHistory: boolean
  readonly lockScope: LockScope = "channel"

  private bot: Bot
  private converter: TelegramConverter
  private chatInstance?: ChatInstance

  private readonly config: TelegramAdapterConfig
  private readonly mediaGroupEvents = new Map<
    string,
    { events: object[]; timer: ReturnType<typeof setTimeout> }
  >()
  private botUsername = ""
  private topicCache = new Map<string, number>()
  private chatInstanceRef = { current: undefined as ChatInstance | undefined }

  private botUsernameRef = { current: "" }

  private readonly clarifyStates = new Map<string, ClarifyState>()
  private readonly conversationEntries = new Map<string, ConversationEntry>()
  private readonly typingStates = new Map<number, TypingState>()
  private readonly subscribedThreads = new Set<string>()

  constructor(config: TelegramAdapterConfig) {
    this.config = config
    this.userName = config.userName ?? "telegram_bot"
    this.converter = new TelegramConverter()
    this.persistThreadHistory = config.persistThreadHistory ?? true

    const fallbackFetch = createFallbackFetch(config.proxyUrl)

    this.bot = new Bot(config.token, {
      client: {
        baseFetchConfig: fallbackFetch as any,
      },
    })

    const botUsernameRef = { current: "" }

    registerHandlers({
      bot: this.bot,
      chatInstanceRef: this.chatInstanceRef,
      encodeThreadId: (id: number) => this.encodeThreadId(id),
      parseMessage: this.parseMessage.bind(this),
      parseAuthor: this.parseAuthor.bind(this),
      mediaGroupEvents: this.mediaGroupEvents,
      mediaGroupDebounceMs: config.mediaGroupDebounceMs ?? TELEGRAM_DEFAULT_MEDIA_GROUP_DEBOUNCE_MS,
      config: this.config,
      botUsernameRef,
      clarifyStates: this.clarifyStates,
      conversationEntries: this.conversationEntries,
      sendErrorAlert: this.sendErrorAlert.bind(this),
      startTypingPeriodic: this.startTypingPeriodic.bind(this),
      stopTypingPeriodic: this.stopTypingPeriodic.bind(this),
    })

    this.botUsernameRef = botUsernameRef
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chatInstance = chat
    this.chatInstanceRef.current = chat

    try {
      const me = await this.bot.api.getMe()
      ;(this as { botUserId?: string }).botUserId = String(me.id)
      ;(this as unknown as { userName: string }).userName = me.username ?? this.userName
      this.botUsername = me.username ?? ""
      this.botUsernameRef.current = me.username ?? ""
    } catch {}

    await this.setBotProfile()

    const webhookUrl = this.config.webhookUrl || process.env.TELEGRAM_WEBHOOK_URL
    if (webhookUrl) {
      await this.setupWebhook(webhookUrl)
    } else {
      startBot(this.bot)
    }
  }

  private async setBotProfile(): Promise<void> {
    try {
      if (this.config.botName || process.env.TELEGRAM_APP_TITLE) {
        await this.bot.api.setMyName(this.config.botName ?? process.env.TELEGRAM_APP_TITLE ?? "")
      }
    } catch {}

    try {
      if (this.config.botDescription || process.env.TELEGRAM_DESCRIPTION) {
        await this.bot.api.setMyDescription(
          this.config.botDescription ?? process.env.TELEGRAM_DESCRIPTION ?? "",
        )
      }
    } catch {}

    try {
      if (this.config.botShortDescription || process.env.TELEGRAM_SHORT_DESCRIPTION) {
        await this.bot.api.setMyShortDescription(
          this.config.botShortDescription ?? process.env.TELEGRAM_SHORT_DESCRIPTION ?? "",
        )
      }
    } catch {}
  }

  private async setupWebhook(webhookUrl: string): Promise<void> {
    try {
      const secret =
        this.config.webhookSecret ||
        process.env.TELEGRAM_WEBHOOK_SECRET ||
        process.env.TELEGRAM_WEBHOOK_SECRET

      const webhookParams: Record<string, unknown> = {
        allowed_updates: this.config.allowedUpdates,
      }
      if (secret !== undefined) {
        webhookParams.secret_token = secret
      }
      await this.bot.api.setWebhook(webhookUrl, webhookParams as never)
    } catch (err) {
      console.error("Failed to set up webhook:", err)
      startBot(this.bot)
    }
  }

  async disconnect(): Promise<void> {
    for (const [, state] of this.typingStates) {
      clearTimeout(state.timer)
    }
    this.typingStates.clear()
    this.bot.api.close()
    stopBot(this.bot)
  }

  encodeThreadId(platformData: TelegramThreadId): string {
    return `telegram:${platformData}`
  }

  decodeThreadId(threadId: string): TelegramThreadId {
    const parts = threadId.split(":")
    return Number(parts[1] ?? parts[0])
  }

  channelIdFromThreadId(threadId: string): string {
    return threadId
  }

  private get parseCtx(): ParseCtx {
    return {
      converter: this.converter,
      encodeThreadId: (id) => this.encodeThreadId(id),
      botUsername: this.botUsername,
      botUserId: this.botUserId,
      configToken: this.config.token,
      botApi: this.bot.api,
    }
  }

  postMessage(threadId: string, message: AdapterPostableMessage): Promise<RawMessage<object>> {
    return messages.postMessage(
      this.bot,
      this.config,
      this.converter,
      (id) => this.decodeThreadId(id),
      (id) => this.encodeThreadId(id),
      threadId,
      message,
    )
  }

  postChannelMessage(
    channelId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<object>> {
    return messages.postChannelMessage(
      this.bot,
      this.config,
      this.converter,
      (id) => this.decodeThreadId(id),
      (id) => this.encodeThreadId(id),
      channelId,
      message,
    )
  }

  editMessage(
    threadId: string,
    messageId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<object>> {
    return messages.editMessage(
      this.bot,
      this.config,
      this.converter,
      (id) => this.decodeThreadId(id),
      (id) => this.encodeThreadId(id),
      threadId,
      messageId,
      message,
    )
  }

  deleteMessage(threadId: string, messageId: string): Promise<void> {
    return messages.deleteMessage(this.bot, (id) => this.decodeThreadId(id), threadId, messageId)
  }

  forwardMessage(
    fromThreadId: string,
    toThreadId: string,
    messageId: string,
  ): Promise<RawMessage<object>> {
    return messages.forwardMessage(
      this.bot,
      (id) => this.decodeThreadId(id),
      (id) => this.encodeThreadId(id),
      fromThreadId,
      toThreadId,
      messageId,
    )
  }

  copyMessage(
    fromThreadId: string,
    toThreadId: string,
    messageId: string,
    options?: {
      caption?: string
      parseMode?: "HTML" | "MarkdownV2"
      replyMarkup?: Record<string, unknown>
    },
  ): Promise<RawMessage<object>> {
    return messages.copyMessage(
      this.bot,
      (id) => this.decodeThreadId(id),
      (id) => this.encodeThreadId(id),
      fromThreadId,
      toThreadId,
      messageId,
      options,
    )
  }

  sendPhoto(
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
    return media.sendPhoto(this.bot, (id) => this.decodeThreadId(id), threadId, photo, options)
  }

  sendDocument(
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
    return media.sendDocument(
      this.bot,
      (id) => this.decodeThreadId(id),
      threadId,
      document,
      options,
    )
  }

  sendVoice(
    threadId: string,
    voice: string | Buffer,
    options?: { caption?: string; parseMode?: "HTML" | "MarkdownV2"; messageThreadId?: number },
  ): Promise<RawMessage<object>> {
    return media.sendVoice(this.bot, (id) => this.decodeThreadId(id), threadId, voice, options)
  }

  sendMediaGroup(
    threadId: string,
    mediaItems: {
      type: "photo" | "video"
      media: string
      caption?: string
      parseMode?: "HTML" | "MarkdownV2"
    }[],
  ): Promise<RawMessage<object>[]> {
    return media.sendMediaGroup(this.bot, (id) => this.decodeThreadId(id), threadId, mediaItems)
  }

  sendPoll(
    threadId: string,
    question: string,
    options: string[],
    pollType?: "quiz" | "regular",
    correctOptionId?: number,
  ): Promise<RawMessage<object>> {
    return media.sendPoll(
      this.bot,
      (id) => this.decodeThreadId(id),
      threadId,
      question,
      options,
      pollType,
      correctOptionId,
    )
  }

  sendDice(
    threadId: string,
    emoji?: "🎲" | "🎯" | "🏀" | "⚽" | "🎳" | "🎰",
  ): Promise<RawMessage<object>> {
    return media.sendDice(this.bot, (id) => this.decodeThreadId(id), threadId, emoji)
  }

  addReaction(threadId: string, messageId: string, emoji: EmojiValue | string): Promise<void> {
    return reactions.addReaction(
      this.bot,
      (id) => this.decodeThreadId(id),
      threadId,
      messageId,
      emoji,
    )
  }

  removeReaction(threadId: string, messageId: string, emoji: EmojiValue | string): Promise<void> {
    return reactions.removeReaction(
      this.bot,
      (id) => this.decodeThreadId(id),
      threadId,
      messageId,
      emoji,
    )
  }

  fetchThread(threadId: string): Promise<ThreadInfo> {
    return chat.fetchThread(this.bot, (id) => this.decodeThreadId(id), threadId)
  }

  fetchMessages(threadId: string, options?: FetchOptions): Promise<FetchResult<object>> {
    return chat.fetchMessages(this.bot, (raw) => parseMessage(this.parseCtx, raw), options)
  }

  fetchMessage(threadId: string, messageId: string): Promise<Message<object> | null> {
    return chat.fetchMessage(
      this.bot,
      (raw) => parseMessage(this.parseCtx, raw),
      threadId,
      messageId,
    )
  }

  fetchChannelInfo(channelId: string): Promise<{
    id: string
    name?: string
    isDM?: boolean
    metadata: Record<string, unknown>
    channelVisibility?: ChannelVisibility
  }> {
    return chat.fetchChannelInfo(this.bot, (id) => this.decodeThreadId(id), channelId)
  }

  getUser(
    userId: string,
  ): Promise<{ userId: string; userName: string; fullName: string; isBot: boolean } | null> {
    return chat.getUser(this.bot, userId)
  }

  openDM(userId: string): Promise<string> {
    return Promise.resolve(chat.openDM((id) => this.encodeThreadId(id), userId))
  }

  startTyping(threadId: string, status?: string): Promise<void> {
    return chat.startTyping(this.bot, (id) => this.decodeThreadId(id), threadId, status)
  }

  sendChatAction(
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
    return chat.sendChatAction(this.bot, (id) => this.decodeThreadId(id), threadId, action)
  }

  getChatAdministrators(threadId: string): Promise<
    {
      user: { id: number; username?: string; first_name: string; last_name?: string }
      status: string
    }[]
  > {
    return chat.getChatAdministrators(this.bot, (id) => this.decodeThreadId(id), threadId)
  }

  getChatMemberCount(threadId: string): Promise<number> {
    return chat.getChatMemberCount(this.bot, (id) => this.decodeThreadId(id), threadId)
  }

  banChatMember(threadId: string, userId: number): Promise<void> {
    return moderation.banChatMember(this.bot, (id) => this.decodeThreadId(id), threadId, userId)
  }

  unbanChatMember(threadId: string, userId: number): Promise<void> {
    return moderation.unbanChatMember(this.bot, (id) => this.decodeThreadId(id), threadId, userId)
  }

  restrictChatMember(
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
    return moderation.restrictChatMember(
      this.bot,
      (id) => this.decodeThreadId(id),
      threadId,
      userId,
      permissions,
    )
  }

  promoteChatMember(
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
    return moderation.promoteChatMember(
      this.bot,
      (id) => this.decodeThreadId(id),
      threadId,
      userId,
      rights,
    )
  }

  setMyCommands(commandsList: { command: string; description: string }[]): Promise<void> {
    return commands.setMyCommands(this.bot, commandsList)
  }

  deleteMyCommands(): Promise<void> {
    return commands.deleteMyCommands(this.bot)
  }

  answerCallbackQuery(
    callbackQueryId: string,
    options?: { text?: string; showAlert?: boolean; url?: string; cacheTime?: number },
  ): Promise<void> {
    return callback.answerCallbackQuery(this.bot, callbackQueryId, options)
  }

  editMessageReplyMarkup(
    threadId: string,
    messageId: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    return callback.editMessageReplyMarkup(
      this.bot,
      (id) => this.decodeThreadId(id),
      threadId,
      messageId,
      replyMarkup,
    )
  }

  createForumTopic(chatId: number, name: string): Promise<number | null> {
    return forum.createForumTopic(this.bot, chatId, name)
  }

  closeForumTopic(chatId: number, messageThreadId: number): Promise<void> {
    return forum.closeForumTopic(this.bot, chatId, messageThreadId)
  }

  reopenForumTopic(chatId: number, messageThreadId: number): Promise<void> {
    return forum.reopenForumTopic(this.bot, chatId, messageThreadId)
  }

  ensureDmTopic(chatId: number, topicName: string): Promise<number | null> {
    return forum.ensureDmTopic(this.bot, this.topicCache, chatId, topicName)
  }

  async onThreadSubscribe?(threadId: string): Promise<void> {
    this.subscribedThreads.add(threadId)
  }

  parseMessage(raw: object): Message<object>
  parseMessage(raw: object, text: string, entities?: TelegramEntity[]): Message<object>
  parseMessage(raw: object, text?: string, _entities?: TelegramEntity[]): Message<object> {
    return parseMessage(this.parseCtx, raw, text!)
  }

  renderFormatted(content: FormattedContent): string {
    return renderFormatted(this.parseCtx, content)
  }

  createClarify(options: {
    threadId: string
    userId: string
    choices: string[]
    ttl?: number
  }): string {
    const id = `clarify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const state: ClarifyState = {
      messageId: "",
      threadId: options.threadId,
      userId: options.userId,
      choices: options.choices,
      resolved: false,
      createdAt: new Date(),
      ttl: options.ttl ?? 300_000,
    }
    this.clarifyStates.set(id, state)

    setTimeout(() => {
      const s = this.clarifyStates.get(id)
      if (s && !s.resolved) {
        this.clarifyStates.delete(id)
      }
    }, state.ttl)

    return id
  }

  getClarifyState(clarifyId: string): ClarifyState | undefined {
    return this.clarifyStates.get(clarifyId)
  }

  resolveClarify(clarifyId: string): void {
    const state = this.clarifyStates.get(clarifyId)
    if (state) {
      state.resolved = true
    }
  }

  getConversationEntry(chatId: number, userId: string): ConversationEntry | undefined {
    return this.conversationEntries.get(`${chatId}:${userId}`)
  }

  setConversationEntry(
    chatId: number,
    userId: string,
    threadId: string,
    command: string,
    data: Record<string, unknown>,
  ): void {
    const key = `${chatId}:${userId}`
    const existing = this.conversationEntries.get(key)
    this.conversationEntries.set(key, {
      userId,
      threadId,
      chatId,
      command,
      step: existing ? existing.step + 1 : 1,
      data,
      createdAt: new Date(),
    })
  }

  clearConversationEntry(chatId: number, userId: string): void {
    this.conversationEntries.delete(`${chatId}:${userId}`)
  }

  isCallbackUserAuthorized(
    from?: Record<string, unknown>,
    message?: Record<string, unknown>,
  ): boolean {
    return callback.isCallbackUserAuthorized(
      from,
      message,
      this.botUserId,
      this.config.allowedGroupIds,
    )
  }

  private async sendErrorAlert(error: unknown, context?: string): Promise<void> {
    const chatId = this.config.errorAlertChatId
    if (!chatId) return

    try {
      const errorText = error instanceof Error ? error.message : String(error)
      const text = `⚠️ *Error Alert*\n${context ? `*Context:* ${context}\n` : ""}*Error:* ${errorText.slice(0, 500)}`
      await this.bot.api.sendMessage(Number(chatId), text, {
        parse_mode: "MarkdownV2",
      })
    } catch {}
  }

  private startTypingPeriodic(chatId: number, threadId?: number): void {
    const existing = this.typingStates.get(chatId)
    if (existing) {
      existing.active = true
      return
    }

    const state: TypingState = {
      chatId,
      threadId: threadId,
      timer: setTimeout(() => {}),
      active: true,
    }

    const sendTyping = async () => {
      if (!state.active) return
      try {
        const actionParams: Record<string, unknown> = {}
        if (threadId !== undefined) {
          actionParams.message_thread_id = threadId
        }
        await this.bot.api.sendChatAction(chatId, "typing", actionParams as never)
      } catch {}
      if (state.active) {
        state.timer = setTimeout(sendTyping, 5000)
      }
    }

    state.timer = setTimeout(sendTyping, 0)
    this.typingStates.set(chatId, state)
  }

  private stopTypingPeriodic(chatId: number): void {
    const state = this.typingStates.get(chatId)
    if (state) {
      state.active = false
      clearTimeout(state.timer)
      this.typingStates.delete(chatId)
    }
  }

  async handleWebhook(request: Request): Promise<Response> {
    const secret =
      this.config.webhookSecret ||
      process.env.TELEGRAM_WEBHOOK_SECRET ||
      process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret) {
      const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
      if (headerSecret !== secret) {
        return new Response("Forbidden", { status: 403 })
      }
    }

    try {
      const body = await request.json()
      const update = body as Update

      if (update.message && this.chatInstance) {
        const message = parseMessage(this.parseCtx, update.message as unknown as object)
        let threadId = this.encodeThreadId(update.message.chat.id)

        if (update.message.is_topic_message && update.message.message_thread_id) {
          const topicThreadId = `${update.message.chat.id}${String(update.message.message_thread_id).padStart(10, "0")}`
          threadId = this.encodeThreadId(Number(topicThreadId))
        }

        await this.chatInstance.processMessage(this, threadId, message)
      }

      if (update.callback_query && this.chatInstance) {
        await callback.handleCallbackQueryRaw(
          this.bot,
          this.chatInstance,
          (id) => this.encodeThreadId(id),
          (from) => this.parseAuthor(from),
          update.callback_query as unknown as Record<string, unknown>,
        )
      }

      if (update.edited_message && this.chatInstance) {
        const message = parseMessage(this.parseCtx, update.edited_message as unknown as object)
        message.metadata.edited = true
        message.metadata.editedAt = new Date()
        const threadId = this.encodeThreadId(update.edited_message.chat.id)
        await this.chatInstance.processMessage(this, threadId, message)
      }

      if (update.channel_post && this.chatInstance) {
        const message = parseMessage(this.parseCtx, update.channel_post as unknown as object)
        const threadId = this.encodeThreadId(update.channel_post.chat.id)
        await this.chatInstance.processMessage(this, threadId, message)
      }

      return new Response("OK", { status: 200 })
    } catch (err) {
      console.error("Webhook error:", err)
      await this.sendErrorAlert(err, "Webhook handling")
      return new Response("OK", { status: 200 })
    }
  }

  private parseAuthor(from?: Record<string, unknown>): Author {
    return {
      userId: String(from?.id ?? "unknown"),
      userName: (from?.username as string) ?? (from?.first_name as string) ?? "unknown",
      fullName: from
        ? [from.first_name as string, from.last_name as string].filter(Boolean).join(" ")
        : "Unknown",
      isBot: (from?.is_bot as boolean) ?? false,
      isMe: String(from?.id) === this.botUserId,
    }
  }

  get api() {
    return this.bot.api
  }

  get converterInstance(): TelegramConverter {
    return this.converter
  }
}
