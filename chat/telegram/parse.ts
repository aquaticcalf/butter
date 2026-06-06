import { Message, type Attachment, type Author, type FormattedContent } from "chat"
import type { Bot } from "grammy"
import type { MessageEntity } from "grammy/types"
import { TelegramConverter, type TelegramEntity } from "./converter"

export interface ParseCtx {
  converter: TelegramConverter
  encodeThreadId: (id: number) => string
  botUsername: string
  botUserId?: string
  configToken: string
  botApi: Bot["api"]
}

export function parseMessage(ctx: ParseCtx, raw: object): Message<object>
export function parseMessage(
  ctx: ParseCtx,
  raw: object,
  text: string,
  entities?: TelegramEntity[],
): Message<object>
export function parseMessage(
  ctx: ParseCtx,
  raw: object,
  explicitText?: string,
  entities?: TelegramEntity[],
): Message<object> {
  const msg = raw as Record<string, unknown>

  const messageId = String((msg.message_id as number) ?? 0)
  const text = explicitText ?? (msg.text as string) ?? (msg.caption as string) ?? ""
  const chat = msg.chat as Record<string, unknown> | undefined
  const chatId = (chat?.id as number) ?? 0
  const threadId = ctx.encodeThreadId(chatId)
  const from = msg.from as Record<string, unknown> | undefined

  const msgEntities =
    entities ??
    (msg.entities as MessageEntity[] | undefined) ??
    (msg.caption_entities as MessageEntity[] | undefined)
  const ast = ctx.converter.toAstWithEntities(
    text,
    msgEntities as unknown as TelegramEntity[] | undefined,
  )

  const attachments = extractAttachments(ctx, msg)
  const links = extractLinks(msgEntities as unknown as TelegramEntity[], text)

  return new Message({
    id: messageId,
    threadId,
    text,
    formatted: ast,
    raw,
    author: parseAuthor(ctx, from),
    metadata: {
      dateSent: new Date(((msg.date as number) ?? 0) * 1000),
      edited: false,
    },
    attachments,
    isMention: checkIsMention(ctx, text, msgEntities as unknown as TelegramEntity[] | undefined),
    links,
  } as never)
}

function checkIsMention(ctx: ParseCtx, text: string, entities?: TelegramEntity[]): boolean {
  if (!ctx.botUsername) return false
  if (text.includes(`@${ctx.botUsername}`)) return true

  if (entities) {
    for (const entity of entities) {
      if (entity.type === "mention") {
        const mention = text.slice(entity.offset, entity.offset + entity.length)
        if (mention === `@${ctx.botUsername}`) return true
      }
    }
  }

  return false
}

function extractAttachments(ctx: ParseCtx, msg: Record<string, unknown>): Attachment[] {
  const attachments: Attachment[] = []

  const photo = msg.photo as
    | Array<{
        file_id: string
        file_unique_id: string
        width: number
        height: number
        file_size?: number
      }>
    | undefined
  if (photo && photo.length > 0) {
    const largest = photo[photo.length - 1]
    attachments.push({
      type: "image",
      name: `photo_${largest.file_unique_id}.jpg`,
      mimeType: "image/jpeg",
      width: largest.width,
      height: largest.height,
      size: largest.file_size,
      url: getFileUrl(ctx, largest.file_id),
      fetchData: () => downloadFile(ctx, largest.file_id),
      fetchMetadata: { fileId: largest.file_id },
    } as never)
  }

  const doc = msg.document as Record<string, unknown> | undefined
  if (doc) {
    attachments.push({
      type: "file",
      name: (doc.file_name as string) ?? `doc_${doc.file_unique_id as string}`,
      mimeType: (doc.mime_type as string) ?? "application/octet-stream",
      size: doc.file_size as number,
      url: getFileUrl(ctx, doc.file_id as string),
      fetchData: () => downloadFile(ctx, doc.file_id as string),
      fetchMetadata: { fileId: doc.file_id as string },
    } as never)
  }

  const voice = msg.voice as Record<string, unknown> | undefined
  if (voice) {
    attachments.push({
      type: "audio",
      name: `voice_${voice.file_unique_id as string}.ogg`,
      mimeType: "audio/ogg",
      duration: voice.duration as number,
      size: voice.file_size as number,
      url: getFileUrl(ctx, voice.file_id as string),
      fetchData: () => downloadFile(ctx, voice.file_id as string),
      fetchMetadata: { fileId: voice.file_id as string },
    } as never)
  }

  const audio = msg.audio as Record<string, unknown> | undefined
  if (audio) {
    attachments.push({
      type: "audio",
      name: (audio.file_name as string) ?? `audio_${audio.file_unique_id as string}`,
      mimeType: (audio.mime_type as string) ?? "audio/mpeg",
      duration: audio.duration as number,
      size: audio.file_size as number,
      url: getFileUrl(ctx, audio.file_id as string),
      fetchData: () => downloadFile(ctx, audio.file_id as string),
      fetchMetadata: { fileId: audio.file_id as string },
    } as never)
  }

  const video = msg.video as Record<string, unknown> | undefined
  if (video) {
    attachments.push({
      type: "video",
      name: (video.file_name as string) ?? `video_${video.file_unique_id as string}.mp4`,
      mimeType: "video/mp4",
      width: video.width as number,
      height: video.height as number,
      duration: video.duration as number,
      size: video.file_size as number,
      url: getFileUrl(ctx, video.file_id as string),
      fetchData: () => downloadFile(ctx, video.file_id as string),
      fetchMetadata: { fileId: video.file_id as string },
    } as never)
  }

  const animation = msg.animation as Record<string, unknown> | undefined
  if (animation) {
    attachments.push({
      type: "file",
      name:
        (animation.file_name as string) ?? `animation_${animation.file_unique_id as string}.gif`,
      mimeType: "image/gif",
      width: animation.width as number,
      height: animation.height as number,
      size: animation.file_size as number,
      url: getFileUrl(ctx, animation.file_id as string),
      fetchData: () => downloadFile(ctx, animation.file_id as string),
      fetchMetadata: { fileId: animation.file_id as string },
    } as never)
  }

  const sticker = msg.sticker as Record<string, unknown> | undefined
  if (sticker) {
    const isAnimated = sticker.is_animated as boolean
    attachments.push({
      type: "image",
      name: `sticker_${sticker.file_unique_id as string}.${isAnimated ? "tgs" : "webp"}`,
      mimeType: isAnimated ? "application/tgs" : "image/webp",
      size: sticker.file_size as number,
      url: getFileUrl(ctx, sticker.file_id as string),
      fetchData: () => downloadFile(ctx, sticker.file_id as string),
      fetchMetadata: { fileId: sticker.file_id as string },
    } as never)
  }

  const videoNote = msg.video_note as Record<string, unknown> | undefined
  if (videoNote) {
    attachments.push({
      type: "video",
      name: `videonote_${videoNote.file_unique_id as string}.mp4`,
      mimeType: "video/mp4",
      duration: videoNote.duration as number,
      size: videoNote.file_size as number,
      url: getFileUrl(ctx, videoNote.file_id as string),
      fetchData: () => downloadFile(ctx, videoNote.file_id as string),
      fetchMetadata: { fileId: videoNote.file_id as string },
    } as never)
  }

  return attachments
}

function extractLinks(entities: TelegramEntity[] | undefined, text: string): { url: string }[] {
  if (!entities) return []

  const links: { url: string }[] = []
  for (const entity of entities) {
    if (entity.type === "url") {
      const url = text.slice(entity.offset, entity.offset + entity.length)
      links.push({ url })
    } else if (entity.type === "text_link" && entity.url) {
      links.push({ url: entity.url })
    }
  }
  return links
}

function getFileUrl(ctx: ParseCtx, fileId: string): string {
  return `https://api.telegram.org/file/bot${ctx.configToken}/${fileId}`
}

async function downloadFile(ctx: ParseCtx, fileId: string): Promise<Buffer> {
  const file = await ctx.botApi.getFile(fileId)
  const url = `https://api.telegram.org/file/bot${ctx.configToken}/${file.file_path}`
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function parseAuthor(ctx: ParseCtx, from?: Record<string, unknown>): Author {
  return {
    userId: String(from?.id ?? "unknown"),
    userName: (from?.username as string) ?? (from?.first_name as string) ?? "unknown",
    fullName: from
      ? [from.first_name as string, from.last_name as string].filter(Boolean).join(" ")
      : "Unknown",
    isBot: (from?.is_bot as boolean) ?? false,
    isMe: String(from?.id) === ctx.botUserId,
  }
}

export function renderFormatted(ctx: ParseCtx, content: FormattedContent): string {
  return ctx.converter.fromAst(content)
}
