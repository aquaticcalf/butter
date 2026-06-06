import { createAgentSession, AuthStorage, ModelRegistry, SessionManager, defineTool, getAgentDir, type CreateAgentSessionOptions, type AgentSession, type AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { TSchema } from 'typebox'
import type { AgentConfig, AgentEvent, AgentHandle, ImageAttachment, SessionInfo, ToolDef } from './types'

function toPiTool(tool: ToolDef) {
  const props: Record<string, TSchema> = {}
  for (const [key, param] of Object.entries(tool.parameters)) {
    const opts = param.description ? { description: param.description } : undefined
    switch (param.type) {
      case 'string':
        props[key] = Type.String(opts)
        break
      case 'number':
        props[key] = Type.Number(opts)
        break
      case 'boolean':
        props[key] = Type.Boolean(opts)
        break
    }
  }

  return defineTool({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: Type.Object(props),
    execute: async (_toolCallId: string, params: unknown, signal: AbortSignal | undefined) => {
      const text = await tool.execute(params as Record<string, unknown>, signal)
      return { content: [{ type: 'text' as const, text }], details: {} }
    },
  })
}

class AgentHandleImpl implements AgentHandle {
  private _session: AgentSession

  constructor(session: AgentSession) {
    this._session = session
  }

  async *prompt(text: string, images?: ImageAttachment[]): AsyncGenerator<AgentEvent> {
    type Resolver = () => void
    let resolve: Resolver | null = null
    const queue: AgentEvent[] = []
    let done = false
    let promptError: Error | null = null

    const push = (event: AgentEvent) => {
      queue.push(event)
      if (resolve) {
        resolve()
        resolve = null
      }
    }

    const unsub = this._session.subscribe((event: AgentSessionEvent) => {
      switch (event.type) {
        case 'message_update': {
          const e = event.assistantMessageEvent
          if (e.type === 'text_delta') {
            push({ type: 'text', delta: e.delta })
          } else if (e.type === 'thinking_delta') {
            push({ type: 'thinking', delta: e.delta })
          }
          break
        }
        case 'tool_execution_start':
          push({ type: 'tool_start', name: event.toolName, args: event.args })
          break
        case 'tool_execution_update':
          push({ type: 'tool_update', name: event.toolName, partial: event.partialResult })
          break
        case 'tool_execution_end':
          push({ type: 'tool_end', name: event.toolName, result: event.result, isError: event.isError })
          break
        case 'agent_end':
          done = true
          if (resolve) {
            resolve()
            resolve = null
          }
          break
      }
    })

    const promptOpts = images
      ? { images: images.map(i => ({ type: 'image' as const, data: i.data, mimeType: i.mimeType })) }
      : undefined

    this._session.prompt(text, promptOpts).catch((err: Error) => {
      promptError = err
      if (resolve) {
        resolve()
        resolve = null
      }
    })

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!
        }
        if (done) break
        if (promptError) throw promptError
        await new Promise<void>(r => { resolve = r })
      }
      yield { type: 'done' as const }
    } finally {
      unsub()
    }
  }

  async abort(): Promise<void> {
    await this._session.abort()
  }

  getSession(): SessionInfo {
    return {
      id: this._session.sessionId,
      file: this._session.sessionFile,
      name: this._session.sessionName,
      messageCount: this._session.messages.length,
      isStreaming: this._session.isStreaming,
      model: this._session.model
        ? { provider: this._session.model.provider, id: this._session.model.id }
        : undefined,
    }
  }

  get sessionId(): string {
    return this._session.sessionId
  }

  get sessionFile(): string | undefined {
    return this._session.sessionFile
  }

  dispose(): void {
    this._session.dispose()
  }
}

export async function createAgent(config: AgentConfig = {}): Promise<AgentHandle> {
  const cwd = config.cwd ?? process.cwd()
  const agentDir = config.agentDir ?? getAgentDir()

  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)

  let model: any
  if (config.model) {
    model = modelRegistry.find(config.model.provider, config.model.id)
  }

  let sessionManager: SessionManager
  switch (config.session?.mode) {
    case 'continue':
      sessionManager = SessionManager.continueRecent(cwd)
      break
    case 'inmemory':
      sessionManager = SessionManager.inMemory(cwd)
      break
    default:
      sessionManager = SessionManager.create(cwd)
  }

  const customTools: ReturnType<typeof toPiTool>[] = []
  const toolNames: string[] = []

  if (config.tools) {
    for (const t of config.tools) {
      if (typeof t === 'string') {
        toolNames.push(t)
      } else {
        customTools.push(toPiTool(t))
        toolNames.push(t.name)
      }
    }
  }

  const opts: CreateAgentSessionOptions = {
    cwd,
    agentDir,
    sessionManager,
    authStorage,
    modelRegistry,
  }
  if (model) opts.model = model
  if (toolNames.length > 0) opts.tools = toolNames
  if (customTools.length > 0) opts.customTools = customTools

  const { session } = await createAgentSession(opts)

  if (config.model?.thinkingLevel) {
    session.setThinkingLevel(config.model.thinkingLevel)
  }

  if (config.session?.name) {
    session.setSessionName(config.session.name)
  }

  return new AgentHandleImpl(session)
}
