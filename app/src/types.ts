import type { ModelConfig, SessionConfig, ToolDef, AskPermissionHandler } from "agent"
import type { TelegramAdapterConfig } from "chat/telegram"
import type { ChatConfig, ChatInstance } from "chat/app"
import type { Db } from "db"

export interface AgentToolsConfig {
  coding?: boolean
  readOnly?: boolean
  custom?: ToolDef[]
  allowlist?: string[]
  denylist?: string[]
}

export interface AgentSkillsConfig {
  paths?: string[]
  includeDefaults?: boolean
}

export interface AppConfig {
  configDir?: string
  db: {
    path: string
  }
  telegram: TelegramAdapterConfig
  agent?: {
    model?: ModelConfig
    tools?: AgentToolsConfig
    skills?: AgentSkillsConfig
    cwd?: string
    agentDir?: string
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
