/** A single parameter in a tool's parameter schema */
export interface ToolParam {
  type: 'string' | 'number' | 'boolean';
  description?: string;
}

/** A tool the LLM can call */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, ToolParam>;
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
}

/** Model selection */
export interface ModelConfig {
  provider: string;
  id: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

/** Session creation mode */
export interface SessionConfig {
  mode?: 'new' | 'continue' | 'inmemory';
  name?: string;
}

/** Agent configuration */
export interface AgentConfig {
  model?: ModelConfig;
  tools?: (string | ToolDef)[];
  cwd?: string;
  agentDir?: string;
  systemPrompt?: string;
  session?: SessionConfig;
}

/** A single event yielded by agent.prompt() */
export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_update'; name: string; partial: unknown }
  | { type: 'tool_end'; name: string; result: unknown; isError: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Read-only snapshot of session state */
export interface SessionInfo {
  id: string;
  file: string | undefined;
  name: string | undefined;
  messageCount: number;
  isStreaming: boolean;
  model: { provider: string; id: string } | undefined;
}

/** Image attachment for prompts */
export interface ImageAttachment {
  data: string;
  mimeType: string;
}

/** Handle returned by createAgent() */
export interface AgentHandle {
  prompt(text: string, images?: ImageAttachment[]): AsyncGenerator<AgentEvent>;
  abort(): Promise<void>;
  getSession(): SessionInfo;
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  dispose(): void;
}
