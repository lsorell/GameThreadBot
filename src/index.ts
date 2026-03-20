import "dotenv/config";
import { GameThreadBot } from "./bot/GameThreadBot";
import { logger } from "./utils/logger";

const bot = new GameThreadBot();

async function main() {
  try {
    await bot.start();
  } catch (error) {
    logger.error("Main", "Failed to start bot", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  logger.info("Main", "Received SIGINT, shutting down");
  await bot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Main", "Received SIGTERM, shutting down");
  await bot.stop();
  process.exit(0);
});

main();
