// Guarantees required WebSocket initialization before Discord client is created
import "./ws-init";

import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
} from "discord.js";
import { config } from "../config";
import { getRepository } from "../database";
import { TrackingService } from "../git/tracker/TrackingService";
import { CommandHandlers, SlashCommandHandler, PrefixCommandHandler } from "./commands";
import { handleGuildCreate } from "./events/guildCreate";
import { NotificationDispatcher } from "./dispatcher";
import { logger } from "../utils/logger";

export class GitcordBot {
  readonly client: Client;
  readonly trackingService: TrackingService;
  readonly commandHandlers: CommandHandlers;
  readonly slashHandler: SlashCommandHandler;
  readonly prefixHandler: PrefixCommandHandler;
  readonly dispatcher: NotificationDispatcher;

  constructor() {
    const repository = getRepository();

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
      allowedMentions: { parse: [] }, // Strict security: prevent unintended pings
    });

    this.trackingService = new TrackingService(
      repository,
      undefined,
      config.pollIntervalSeconds
    );

    this.commandHandlers = new CommandHandlers(
      repository,
      this.trackingService,
      undefined,
      config.prefix
    );

    this.slashHandler = new SlashCommandHandler(this.commandHandlers);
    this.prefixHandler = new PrefixCommandHandler(this.commandHandlers, config.prefix);
    this.dispatcher = new NotificationDispatcher(this.client);

    this.setupEvents();
  }

  private setupEvents(): void {
    const repository = getRepository();

    this.client.once("ready", () => {
      logger.info(`Gitcord bot successfully logged in as ${this.client.user?.tag}`);
      logger.info(`Serving ${this.client.guilds.cache.size} guild(s)`);

      this.client.user?.setActivity({
        name: `/git help | ${config.prefix} help`,
        type: ActivityType.Custom,
      });

      // Wire tracking notifications to Discord dispatcher
      this.trackingService.onNotification((event, subs) => {
        return this.dispatcher.dispatch(event, subs);
      });

      // Start background polling service
      this.trackingService.start();
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.slashHandler.handleInteraction(interaction);
      }
    });

    this.client.on("messageCreate", async (message) => {
      await this.prefixHandler.handleMessage(message);
    });

    this.client.on("guildCreate", async (guild) => {
      await handleGuildCreate(guild, repository, config.prefix);
    });

    this.client.on("error", (err) => {
      logger.error("Discord client encountered an error", err);
    });

    this.client.on("warn", (warn) => {
      logger.warn(`Discord client warning: ${warn}`);
    });
  }

  async start(): Promise<void> {
    if (!config.discordToken) {
      logger.error("DISCORD_TOKEN is not configured in environment. Bot cannot connect.");
      return;
    }

    logger.info("Connecting Gitcord to Discord gateway...");
    await this.client.login(config.discordToken);
  }

  async stop(): Promise<void> {
    logger.info("Gracefully shutting down Gitcord...");
    this.trackingService.stop();
    this.client.destroy();
    logger.info("Shutdown complete.");
  }
}
