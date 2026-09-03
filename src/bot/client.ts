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
  client: Client;
  readonly trackingService: TrackingService;
  readonly commandHandlers: CommandHandlers;
  readonly slashHandler: SlashCommandHandler;
  readonly prefixHandler: PrefixCommandHandler;
  dispatcher: NotificationDispatcher;
  private isShuttingDown = false;

  constructor(includeMessageContent = true) {
    const repository = getRepository();

    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ];
    if (includeMessageContent) {
      intents.push(GatewayIntentBits.MessageContent);
    }

    this.client = new Client({
      intents,
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
    if (!config.discordToken || config.discordToken.trim() === "") {
      logger.error("==================================================================");
      logger.error("DISCORD_TOKEN is missing or empty in .env!");
      logger.error("Please configure a valid DISCORD_TOKEN in your .env file.");
      logger.error("Pausing container to prevent continuous restart loops.");
      logger.error("After updating .env, run: docker compose restart");
      logger.error("==================================================================");

      // Keep process alive so Docker Compose doesn't loop restart
      await new Promise((resolve) => setInterval(resolve, 60000));
      return;
    }

    logger.info("Connecting Gitcord to Discord gateway...");

    try {
      await this.client.login(config.discordToken);
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || "";

      // Check for DisallowedIntents (Message Content intent disabled in portal)
      if (
        errMsg.includes("DisallowedIntents") ||
        errMsg.includes("Privileged intent") ||
        errMsg.includes("disallowed intent")
      ) {
        logger.warn("==================================================================");
        logger.warn("Discord rejected login: Message Content intent is disabled in Developer Portal.");
        logger.warn("Retrying login without MessageContent intent...");
        logger.warn("Slash commands (/git ...) will remain fully operational.");
        logger.warn("To enable prefix commands (git ...), toggle 'Message Content Intent' in Discord Developer Portal -> Bot.");
        logger.warn("==================================================================");

        // Destroy previous client and recreate without MessageContent intent
        this.client.destroy();
        const fallbackClient = new Client({
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
          partials: [Partials.Channel, Partials.Message],
          allowedMentions: { parse: [] },
        });

        this.client = fallbackClient;
        this.dispatcher = new NotificationDispatcher(this.client);
        this.setupEvents();

        await this.client.login(config.discordToken);
        return;
      }

      if (errMsg.includes("TokenInvalid") || errMsg.includes("invalid token")) {
        logger.error("==================================================================");
        logger.error("The provided DISCORD_TOKEN is invalid.");
        logger.error("Please verify your token in the Discord Developer Portal.");
        logger.error("Pausing container to prevent continuous restart loops.");
        logger.error("After updating .env, run: docker compose restart");
        logger.error("==================================================================");

        await new Promise((resolve) => setInterval(resolve, 60000));
        return;
      }

      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    logger.info("Gracefully shutting down Gitcord...");
    this.trackingService.stop();
    this.client.destroy();
    logger.info("Shutdown complete.");
  }
}
