import { Message } from "discord.js";
import { CommandHandlers, CommandContext } from "./handlers";
import { hasAdminOrManageGuildPermission } from "../../discord/permissions";
import { logger } from "../../utils/logger";

export class PrefixCommandHandler {
  constructor(
    private handlers: CommandHandlers,
    private prefix = "git"
  ) {}

  async handleMessage(message: Message): Promise<void> {
    // Ignore bots and webhooks
    if (message.author.bot || message.webhookId) return;

    const content = message.content.trim();

    // Distinguish normal Discord messages from prefix commands
    // Prefix must match at the beginning followed by whitespace or end of string
    const prefixRegex = new RegExp(`^${this.prefix}(?:\\s+|$)`, "i");
    if (!prefixRegex.test(content)) {
      return;
    }

    const withoutPrefix = content.slice(this.prefix.length).trim();
    if (!withoutPrefix) {
      // Just "git" -> display help
      await this.dispatch(message, "help", []);
      return;
    }

    // Split args respecting quotes
    const rawTokens = withoutPrefix.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const tokens = rawTokens.map((t) => t.replace(/^["']|["']$/g, ""));
    const commandName = tokens[0]?.toLowerCase();
    const args = tokens.slice(1);

    if (!commandName) {
      await this.dispatch(message, "help", []);
      return;
    }

    await this.dispatch(message, commandName, args);
  }

  private async dispatch(message: Message, command: string, args: string[]): Promise<void> {
    const ctx: CommandContext = {
      guildId: message.guildId,
      channelId: message.channelId,
      memberHasAdmin: hasAdminOrManageGuildPermission(message),
      message,
      reply: async (opts) => {
        return message.reply({
          content: opts.content,
          embeds: opts.embeds,
          allowedMentions: { parse: [] },
        });
      },
    };

    try {
      switch (command) {
        case "help":
          await this.handlers.handleHelp(ctx);
          break;

        case "setup":
          // git setup: configure current channel as notification channel
          await this.handlers.handleSetup(ctx, { channelId: message.channelId });
          break;

        case "instance":
        case "instances":
          await this.handlers.handleInstance(ctx, "list");
          break;

        case "follow":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} follow <repository-or-user> [user|repository] [instanceUrl]\`` });
            return;
          }
          await this.handlers.handleFollow(ctx, args[0], args[1] as "repository" | "user", args[2]);
          break;

        case "unfollow":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} unfollow <repository-or-user>\`` });
            return;
          }
          await this.handlers.handleUnfollow(ctx, args[0]);
          break;

        case "follows":
          await this.handlers.handleFollows(ctx);
          break;

        case "repo":
        case "repository":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} repository <owner/name>\`` });
            return;
          }
          await this.handlers.handleRepository(ctx, args[0]);
          break;

        case "commits":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} commits <owner/name> [branch] [limit]\`` });
            return;
          }
          await this.handlers.handleCommits(ctx, args[0], args[1], args[2] ? parseInt(args[2], 10) : 5);
          break;

        case "issues":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} issues <owner/name> [open|closed|all]\`` });
            return;
          }
          await this.handlers.handleIssues(ctx, args[0], (args[1] as "open" | "closed" | "all") || "open");
          break;

        case "prs":
        case "pulls":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} prs <owner/name> [open|closed|all]\`` });
            return;
          }
          await this.handlers.handlePullRequests(ctx, args[0], (args[1] as "open" | "closed" | "all") || "open");
          break;

        case "history":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} history <owner/name>\`` });
            return;
          }
          await this.handlers.handleHistory(ctx, args[0], args[1] ? parseInt(args[1], 10) : 20);
          break;

        case "branches":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} branches <owner/name>\`` });
            return;
          }
          await this.handlers.handleBranches(ctx, args[0]);
          break;

        case "user":
          if (!args[0]) {
            await ctx.reply({ content: `Usage: \`${this.prefix} user <username> [instanceUrl]\`` });
            return;
          }
          await this.handlers.handleUser(ctx, args[0], args[1]);
          break;

        case "status":
          await this.handlers.handleStatus(ctx, message.client.ws.ping);
          break;

        default:
          // If unrecognized command, ignore or show brief suggestion if starting with git
          break;
      }
    } catch (err) {
      logger.error(`Error executing prefix command ${command}`, err);
      await ctx.reply({ content: "An error occurred while executing that command." });
    }
  }
}
