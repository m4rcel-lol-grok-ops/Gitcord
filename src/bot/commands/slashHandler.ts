import { ChatInputCommandInteraction } from "discord.js";
import { CommandHandlers, CommandContext } from "./handlers";
import { hasAdminOrManageGuildPermission } from "../../discord/permissions";
import { logger } from "../../utils/logger";

export class SlashCommandHandler {
  constructor(private handlers: CommandHandlers) {}

  async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName !== "git") return;

    const subcommand = interaction.options.getSubcommand();

    const ctx: CommandContext = {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      memberHasAdmin: hasAdminOrManageGuildPermission(interaction),
      interaction,
      reply: async (opts) => {
        if (interaction.deferred || interaction.replied) {
          return interaction.editReply({
            content: opts.content,
            embeds: opts.embeds,
            allowedMentions: { parse: [] },
          });
        }
        return interaction.reply({
          content: opts.content,
          embeds: opts.embeds,
          ephemeral: opts.ephemeral,
          allowedMentions: { parse: [] },
        });
      },
    };

    try {
      switch (subcommand) {
        case "setup": {
          const channel = interaction.options.getChannel("channel");
          const commits = interaction.options.getBoolean("commits") ?? undefined;
          const issues = interaction.options.getBoolean("issues") ?? undefined;
          const prs = interaction.options.getBoolean("prs") ?? undefined;
          const releases = interaction.options.getBoolean("releases") ?? undefined;

          await this.handlers.handleSetup(ctx, {
            channelId: channel?.id,
            commits,
            issues,
            prs,
            releases,
          });
          break;
        }

        case "instance": {
          const action = interaction.options.getString("action", true) as "list" | "add";
          const url = interaction.options.getString("url") || undefined;
          const name = interaction.options.getString("name") || undefined;
          await this.handlers.handleInstance(ctx, action, url, name);
          break;
        }

        case "follow": {
          const target = interaction.options.getString("target", true);
          const type = interaction.options.getString("type") as "repository" | "user" | null;
          const instance = interaction.options.getString("instance") || undefined;
          const channel = interaction.options.getChannel("channel") || undefined;

          await interaction.deferReply();
          await this.handlers.handleFollow(ctx, target, type || undefined, instance, channel?.id);
          break;
        }

        case "unfollow": {
          const target = interaction.options.getString("target", true);
          await this.handlers.handleUnfollow(ctx, target);
          break;
        }

        case "follows": {
          await this.handlers.handleFollows(ctx);
          break;
        }

        case "repository": {
          const repo = interaction.options.getString("repository", true);
          await interaction.deferReply();
          await this.handlers.handleRepository(ctx, repo);
          break;
        }

        case "commits": {
          const repo = interaction.options.getString("repository", true);
          const branch = interaction.options.getString("branch") || undefined;
          const limit = interaction.options.getInteger("limit") || 5;
          await interaction.deferReply();
          await this.handlers.handleCommits(ctx, repo, branch, limit);
          break;
        }

        case "issues": {
          const repo = interaction.options.getString("repository", true);
          const state = (interaction.options.getString("state") as "open" | "closed" | "all") || "open";
          await interaction.deferReply();
          await this.handlers.handleIssues(ctx, repo, state);
          break;
        }

        case "prs": {
          const repo = interaction.options.getString("repository", true);
          const state = (interaction.options.getString("state") as "open" | "closed" | "all") || "open";
          await interaction.deferReply();
          await this.handlers.handlePullRequests(ctx, repo, state);
          break;
        }

        case "history": {
          const repo = interaction.options.getString("repository", true);
          const limit = interaction.options.getInteger("limit") || 20;
          await this.handlers.handleHistory(ctx, repo, limit);
          break;
        }

        case "branches": {
          const repo = interaction.options.getString("repository", true);
          await interaction.deferReply();
          await this.handlers.handleBranches(ctx, repo);
          break;
        }

        case "user": {
          const username = interaction.options.getString("username", true);
          const instance = interaction.options.getString("instance") || "https://github.com";
          await interaction.deferReply();
          await this.handlers.handleUser(ctx, username, instance);
          break;
        }

        case "status": {
          await this.handlers.handleStatus(ctx, interaction.client.ws.ping);
          break;
        }

        case "help": {
          await this.handlers.handleHelp(ctx);
          break;
        }
      }
    } catch (err) {
      logger.error(`Error executing slash command /git ${subcommand}`, err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "An unexpected error occurred while executing this command. Please try again later.",
        });
      } else {
        await interaction.reply({
          content: "An unexpected error occurred while executing this command. Please try again later.",
          ephemeral: true,
        });
      }
    }
  }
}
