import { createApp } from "app"

const DB_PATH = process.env.BUTTER_DB_PATH ?? "butter.db"
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is required")
  process.exit(1)
}

const app = await createApp({
  db: { path: DB_PATH },
  telegram: { token: TELEGRAM_BOT_TOKEN },
})

process.on("SIGINT", async () => {
  console.log("\nShutting down...")
  await app.stop()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  await app.stop()
  process.exit(0)
})

await app.start()
console.log("Butter is running...")
await new Promise(() => {})
