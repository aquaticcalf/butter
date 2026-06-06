import { Bot } from "grammy"

export function startBot(bot: Bot): void {
  bot
    .start({
      onStart: () => {
        console.log("Telegram bot polling started")
      },
      drop_pending_updates: true,
    })
    .catch((err) => {
      console.error("Telegram polling error:", err)
      setTimeout(() => {
        try {
          bot.start({ drop_pending_updates: false })
        } catch {
          // ignore retry failure
        }
      }, 5000)
    })
}

export function stopBot(bot: Bot): void {
  try {
    bot.stop()
  } catch {
    // Ignore stop errors
  }
}
