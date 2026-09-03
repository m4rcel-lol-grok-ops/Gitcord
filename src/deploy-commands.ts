import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { gitSlashCommand } from "./bot/commands/definitions";
import { config } from "./config";
import { logger } from "./utils/logger";

export async function deployCommands(): Promise<void> {
  const token = config.discordToken;
  const clientId = config.discordClientId;
  const guildId = config.discordGuildId;

  if (!token || !clientId) {
    logger.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment variables");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const commands = [gitSlashCommand.toJSON()];

  try {
    if (guildId) {
      logger.info(`Deploying ${commands.length} slash commands to development guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      logger.info("Successfully registered commands to guild.");
    } else {
      logger.info(`Deploying ${commands.length} global slash commands...`);
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      logger.info("Successfully registered global slash commands.");
    }
  } catch (err) {
    logger.error("Failed to deploy slash commands", err);
  }
}

if (require.main === module) {
  deployCommands().catch((err) => {
    logger.error("Deployment script failed", err);
    process.exit(1);
  });
}
