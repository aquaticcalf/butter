import type { Bot } from "grammy"

export async function setMyCommands(
  bot: Bot,
  commands: { command: string; description: string }[],
): Promise<void> {
  try {
    await bot.api.setMyCommands(commands)
  } catch {}
}

export async function deleteMyCommands(bot: Bot): Promise<void> {
  try {
    await bot.api.deleteMyCommands()
  } catch {}
}
