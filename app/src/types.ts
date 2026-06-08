import type { ModelConfig, SessionConfig, ToolDef, AskPermissionHandler } from "agent"
import type { TelegramAdapterConfig } from "chat/telegram"
import type { ChatConfig, ChatInstance } from "chat/app"
import type { Db } from "db"

export interface AppConfig {
  db: {
    path: string
  }
  telegram: TelegramAdapterConfig
  agent?: {
    model?: ModelConfig
    tools?: (string | ToolDef)[]
    cwd?: string
    agentDir?: string
    systemPrompt?: string
    session?: SessionConfig
    askPermission?: AskPermissionHandler
  }
  chat?: Partial<Omit<ChatConfig, "adapters" | "state">>
}

export interface AppHandle {
  db: Db
  chat: ChatInstance
  start(): Promise<void>
  stop(): Promise<void>
}
