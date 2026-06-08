import { Chat, type ChatConfig } from "chat"
import { TelegramAdapter, type TelegramAdapterConfig } from "../telegram/index.js"
import { createMemoryState } from "./state.js"

export type AppConfig = {
  telegram: TelegramAdapterConfig
  chat?: Partial<Omit<ChatConfig, "adapters" | "state">>
}

export async function createApp(config: AppConfig) {
  const telegram = new TelegramAdapter(config.telegram)
  const { username } = await telegram.api.getMe()

  const state = createMemoryState()

  const chat = new Chat({
    userName: username ?? "",
    adapters: { telegram },
    state,
    ...config.chat,
  })

  return chat
}

export { TelegramAdapter, createMemoryState }
export type { TelegramAdapterConfig }
export { Chat } from "chat"
export type {
  ChatConfig,
  ChatInstance,
  Lock,
  Message,
  QueueEntry,
  StateAdapter,
  Thread,
  ThreadInfo,
  Author,
  Adapter,
} from "chat"
