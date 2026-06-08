import { createDb } from "db"
import { Chat, type ChatConfig } from "chat/app"
import { TelegramAdapter } from "chat/telegram"
import { createDbState } from "./state"
import type { AppConfig, AppHandle } from "./types"

export async function createApp(config: AppConfig): Promise<AppHandle> {
  const { sqlite, db } = createDb(config.db.path)
  const state = createDbState(sqlite)
  const telegram = new TelegramAdapter(config.telegram)
  const { username } = await telegram.api.getMe()

  const chatConfig: ChatConfig = {
    userName: username ?? "",
    adapters: { telegram },
    state,
    ...config.chat,
  }

  const chat = new Chat(chatConfig)

  chat.onNewMention(async (thread, message) => {
    await thread.subscribe()
    await handleMessage(thread, message.text ?? "")
  })

  chat.onDirectMessage(async (thread, message) => {
    await thread.subscribe()
    await handleMessage(thread, message.text ?? "")
  })

  chat.onSubscribedMessage(async (thread, message) => {
    await handleMessage(thread, message.text ?? "")
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

async function handleMessage(thread: import("chat/app").Thread, text: string): Promise<void> {
  if (!text.trim()) return

  try {
    const { createAgent } = await import("agent")

    const agent = await createAgent({
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
