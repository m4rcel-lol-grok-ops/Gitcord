import { initDatabase } from "./database";
import { GitcordBot } from "./bot/client";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  logger.info("Initializing Gitcord — Production Git Integration Bot");

  // Initialize SQLite database and run pending migrations
  const { db } = initDatabase();

  const bot = new GitcordBot();

  // Handle graceful process shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Initiating clean shutdown...`);
    try {
      await bot.stop();
      db.close();
      logger.info("Database closed. Exiting process.");
      process.exit(0);
    } catch (err) {
      logger.error("Error during shutdown", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection caught", reason);
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception caught", error);
  });

  await bot.start();
}

main().catch((err) => {
  logger.error("==================================================================");
  logger.error("FATAL STARTUP ERROR OCCURRED", err);
  logger.error("Pausing container to prevent continuous Docker restart loop.");
  logger.error("Please inspect the error above, update your .env or configuration,");
  logger.error("and run 'docker compose restart' to apply changes.");
  logger.error("==================================================================");

  // Keep event loop alive so error is captured in docker logs and avoids instant restart loop
  setInterval(() => {}, 60000);
});
