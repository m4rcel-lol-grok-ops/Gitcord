import { EmbedBuilder } from "discord.js";

export function buildOnboardingEmbed(prefix = "git"): EmbedBuilder {
  const embed = new EmbedBuilder();

  embed.setColor(0x2f3136); // Discord Dark
  embed.setTitle("Thanks for inviting Gitcord to your server! 👋");
  embed.setDescription(
    "Gitcord brings Git activity directly into your Discord server with beautiful, information-dense embeds for commits, issues, pull requests, and releases.\n\n" +
    "**Gitcord is strictly read-only** — it monitors repositories and users across GitHub, GitLab, Gitea, and Forgejo instances without modifying your repositories."
  );

  embed.addFields(
    {
      name: "🚀 Quick Setup",
      value:
        "**1. Configure Notification Channel:**\n" +
        `Use \`/git setup\` or \`${prefix} setup\` to choose where Git events are posted and toggle event types.\n\n` +
        "**2. Follow a Repository or User:**\n" +
        `Use \`/git follow\` or \`${prefix} follow\` to start monitoring Git activity.\n\n` +
        "**3. Automatic Monitoring:**\n" +
        "Gitcord periodically polls Git APIs, calculates file & diff statistics, and notifies your server in real-time.",
      inline: false,
    },
    {
      name: "⚡ Useful Slash Commands",
      value:
        "• `/git setup` — Configure notification channels and event toggles\n" +
        "• `/git follow` — Follow a Git repository or user profile\n" +
        "• `/git unfollow` — Stop tracking a repository or user\n" +
        "• `/git follows` — List all monitored repositories and users\n" +
        "• `/git history` — View paginated commit history with diff statistics\n" +
        "• `/git repository` — View repository details, stars, and branches\n" +
        "• `/git user` — View user statistics and profile info\n" +
        "• `/git status` — Check bot health, database, and tracking cycle\n" +
        "• `/git help` — Display full command manual",
      inline: false,
    },
    {
      name: `⌨️ Prefix Commands (Default: \`${prefix}\`)`,
      value:
        `• \`${prefix} help\` — Display help reference\n` +
        `• \`${prefix} setup\` — Set current channel for notifications\n` +
        `• \`${prefix} follow <repo-or-user>\` — Follow a repository or user\n` +
        `• \`${prefix} follows\` — View tracked subscriptions\n` +
        `• \`${prefix} commits <repo>\` — Show recent commits\n` +
        `• \`${prefix} history <repo>\` — Interactive commit log`,
      inline: false,
    },
    {
      name: "🌐 Git Instances Supported",
      value: "Supports GitHub (`github.com`), GitLab (`gitlab.com` & self-hosted), Codeberg / Forgejo (`codeberg.org`), and Gitea.",
      inline: false,
    }
  );

  embed.setFooter({ text: "Gitcord • Read-Only Git Integration Bot" });
  embed.setTimestamp();

  return embed;
}
