import "dotenv/config";
import { GameThreadBot } from "./bot/GameThreadBot";

// Initialize and start the bot
const bot = new GameThreadBot();

async function main() {
  try {
    await bot.start();
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down bot...");
  await bot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down bot...");
  await bot.stop();
  process.exit(0);
});

// Start the bot
main();
