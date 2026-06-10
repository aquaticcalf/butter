import type { Skill } from "@earendil-works/pi-coding-agent"

export interface ToolParam {
  type: "string" | "number" | "boolean"
  description?: string
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, ToolParam>
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<string>
}

export interface ModelConfig {
  provider: string
  id: string
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
}

export interface SessionConfig {
  mode?: "new" | "continue" | "inmemory"
  name?: string
}

export type AskPermissionHandler = (
  toolName: string,
  args: Record<string, unknown>,
) => { allow: boolean; reason?: string } | Promise<{ allow: boolean; reason?: string }>

export interface AgentConfig {
  model?: ModelConfig
  tools?: (string | ToolDef)[]
  skills?: Skill[]
  systemPrompt?: string
  cwd?: string
  agentDir?: string
  session?: SessionConfig
  askPermission?: AskPermissionHandler
  /** Enable built-in pi coding tools (read, write, edit, bash) */
  codingTools?: boolean
  /** Enable read-only tools (ls, grep, find) */
  readOnlyTools?: boolean
  /** Tool names to explicitly enable */
  toolAllowlist?: string[]
  /** Tool names to disable */
  toolDenylist?: string[]
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_update"; name: string; partial: unknown }
  | { type: "tool_end"; name: string; result: unknown; isError: boolean }
  | { type: "done" }
  | { type: "error"; message: string }

export interface SessionInfo {
  id: string
  file: string | undefined
  name: string | undefined
  messageCount: number
  isStreaming: boolean
  model: { provider: string; id: string } | undefined
}

export interface ImageAttachment {
  data: string
  mimeType: string
}

export interface AgentHandle {
  prompt(text: string, images?: ImageAttachment[]): AsyncGenerator<AgentEvent>
  abort(): Promise<void>
  getSession(): SessionInfo
  readonly sessionId: string
  readonly sessionFile: string | undefined
  dispose(): void
}
