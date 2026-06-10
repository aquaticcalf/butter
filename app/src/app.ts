import { readFileSync, existsSync } from "fs"
import { join, resolve } from "path"
import os from "os"
import { parse } from "smol-toml"
import { createDb } from "db"
import { Chat, type ChatConfig } from "chat/app"
import { TelegramAdapter } from "chat/telegram"
import { createDbState } from "./state"
import type { AppConfig, AppHandle } from "./types"
import type { ModelConfig } from "agent"

interface TomlModels {
  models?: {
    provider?: string
    model?: string
    overrides?: Record<string, unknown>
  }
}

interface TomlSettings {
  agent?: {
    coding_tools?: boolean
    readonly_tools?: boolean
    include_default_skills?: boolean
  }
  prompt?: {
    active?: string
  }
  telegram?: {
    guest_mode?: boolean
    require_mention?: boolean
    observe_unmentioned?: boolean
  }
}

function readPrompt(promptDir: string, active: string): string | null {
  const promptPath = join(promptDir, `${active}.md`)
  if (existsSync(promptPath)) {
    return readFileSync(promptPath, "utf-8")
  }
  const fallback = join(promptDir, "default.md")
  if (existsSync(fallback)) {
    return readFileSync(fallback, "utf-8")
  }
  return null
}

function readConfigDir(configDir: string, promptDir: string): {
  models: TomlModels
  settings: TomlSettings
  systemPrompt: string | null
} {
  const models: TomlModels = {}
  const settings: TomlSettings = {}
  let systemPrompt: string | null = null

  const modelsPath = join(configDir, "models.toml")
  if (existsSync(modelsPath)) {
    Object.assign(models, parse(readFileSync(modelsPath, "utf-8")))
  }

  const settingsPath = join(configDir, "settings.toml")
  if (existsSync(settingsPath)) {
    Object.assign(settings, parse(readFileSync(settingsPath, "utf-8")))
  }

  systemPrompt = readPrompt(promptDir, settings.prompt?.active ?? "default")

  return { models, settings, systemPrompt }
}

export async function createApp(config: AppConfig): Promise<AppHandle> {
  const configDir = config.configDir ? resolve(config.configDir) : resolve(process.cwd(), "config")
  const promptDir = resolve(process.cwd(), "prompt")

  const { models: tomlModels, settings: tomlSettings, systemPrompt } = readConfigDir(configDir, promptDir)

  const { sqlite, db } = createDb(config.db.path)
  const state = createDbState(sqlite)

  const telegramToken = config.telegram.token || process.env.TELEGRAM_BOT_TOKEN || ""
  const telegram = new TelegramAdapter({
    ...config.telegram,
    token: telegramToken,
    guestMode: config.telegram.guestMode ?? tomlSettings.telegram?.guest_mode ?? false,
    requireMention:
      config.telegram.requireMention ?? tomlSettings.telegram?.require_mention ?? true,
    observeUnmentionedGroupMessages:
      config.telegram.observeUnmentionedGroupMessages ??
      tomlSettings.telegram?.observe_unmentioned ??
      false,
  })

  const { username } = await telegram.api.getMe()

  const chatConfig: ChatConfig = {
    userName: username ?? "",
    adapters: { telegram },
    state,
    ...config.chat,
  }

  const chat = new Chat(chatConfig)

  const agentTools = config.agent?.tools ?? {}
  const agentSkills = config.agent?.skills ?? {}
  const tomlAgent = tomlSettings.agent ?? {}

  const modelConfig: ModelConfig | undefined =
    config.agent?.model ??
    (tomlModels.models?.provider && tomlModels.models?.model
      ? { provider: tomlModels.models.provider, id: tomlModels.models.model }
      : undefined)

  chat.onNewMention(async (thread, message) => {
    await thread.subscribe()
    await handleMessage(thread, message.text ?? "", {
      configDir,
      modelConfig,
      agentTools,
      agentSkills,
      tomlAgent,
      systemPrompt,
    })
  })

  chat.onDirectMessage(async (thread, message) => {
    await thread.subscribe()
    await handleMessage(thread, message.text ?? "", {
      configDir,
      modelConfig,
      agentTools,
      agentSkills,
      tomlAgent,
      systemPrompt,
    })
  })

  chat.onSubscribedMessage(async (thread, message) => {
    await handleMessage(thread, message.text ?? "", {
      configDir,
      modelConfig,
      agentTools,
      agentSkills,
      tomlAgent,
      systemPrompt,
    })
  })

  return {
    db,
    chat,
    async start() {
      await chat.initialize()
    },
    async stop() {
      await chat.shutdown()
      sqlite.close()
    },
  }
}

interface HandleMessageOpts {
  configDir: string
  modelConfig: ModelConfig | undefined
  agentTools: {
    coding?: boolean
    readOnly?: boolean
    custom?: import("agent").ToolDef[]
    allowlist?: string[]
    denylist?: string[]
  }
  agentSkills: { paths?: string[]; includeDefaults?: boolean }
  tomlAgent: { coding_tools?: boolean; readonly_tools?: boolean; include_default_skills?: boolean }
  systemPrompt: string | null
}

async function handleMessage(
  thread: import("chat/app").Thread,
  text: string,
  opts: HandleMessageOpts,
): Promise<void> {
  if (!text.trim()) return

  try {
    const { createAgent } = await import("agent")
    const { loadSkills, loadSkillsFromDir, formatSkillsForPrompt } =
      await import("@earendil-works/pi-coding-agent")

    let systemPrompt = opts.systemPrompt ?? undefined

    const piSkills: import("@earendil-works/pi-coding-agent").Skill[] = []

    const skillsDir = join(opts.configDir, "skills")
    if (existsSync(skillsDir)) {
      const result = loadSkillsFromDir({ dir: skillsDir, source: "config/skills" })
      piSkills.push(...result.skills)
    }

    if (opts.agentSkills.paths && opts.agentSkills.paths.length > 0) {
      for (const p of opts.agentSkills.paths) {
        const result = loadSkillsFromDir({ dir: resolve(p), source: p })
        piSkills.push(...result.skills)
      }
    }

    if (opts.tomlAgent.include_default_skills ?? opts.agentSkills.includeDefaults ?? true) {
      const cwd = process.cwd()
      const agentDir = join(os.homedir(), ".pi", "agent")
      const result = loadSkills({ cwd, agentDir, skillPaths: [], includeDefaults: true })
      if (result.skills.length > 0) {
        const formatted = formatSkillsForPrompt(result.skills)
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${formatted}` : formatted
      }
    }

    const codingTools = opts.tomlAgent.coding_tools ?? opts.agentTools.coding ?? true
    const readOnlyTools = opts.tomlAgent.readonly_tools ?? opts.agentTools.readOnly ?? false

    const agent = await createAgent({
      ...(opts.modelConfig ? { model: opts.modelConfig } : {}),
      codingTools,
      readOnlyTools,
      tools: opts.agentTools.custom ?? [],
      ...(opts.agentTools.allowlist ? { toolAllowlist: opts.agentTools.allowlist } : {}),
      ...(opts.agentTools.denylist ? { toolDenylist: opts.agentTools.denylist } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      skills: piSkills,
      session: { mode: "inmemory" },
    })

    const stream = agentToTextStream(agent.prompt(text))
    await thread.post(stream)
  } catch (err) {
    await thread.post(`Error: ${(err as Error).message}`)
  }
}

async function* agentToTextStream(
  gen: AsyncGenerator<import("agent").AgentEvent>,
): AsyncGenerator<string> {
  for await (const event of gen) {
    if (event.type === "text") {
      yield event.delta
    }
  }
}
