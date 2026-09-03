import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
} from "discord.js";
import { DatabaseRepository } from "../../database/repository";
import { ProviderRegistry, providerRegistry } from "../../git/providers";
import { TrackingService } from "../../git/tracker/TrackingService";
import { parseRepositoryInput, validateGitInstanceUrl } from "../../utils/url-validator";
import { hasAdminOrManageGuildPermission } from "../../discord/permissions";
import {
  buildRepositoryEmbed,
  buildUserEmbed,
  buildSystemEmbed,
  buildOnboardingEmbed,
} from "../../discord/embeds";
import { sendPaginatedHistory } from "../../discord/pagination/historyPaginator";
import { logger } from "../../utils/logger";
import { sanitizeText } from "../../utils/sanitize";

export interface CommandContext {
  reply(options: {
    content?: string;
    embeds?: EmbedBuilder[];
    ephemeral?: boolean;
  }): Promise<unknown>;
  guildId: string | null;
  channelId: string;
  memberHasAdmin: boolean;
  interaction?: ChatInputCommandInteraction;
  message?: Message;
}

export class CommandHandlers {
  constructor(
    private repo: DatabaseRepository,
    private tracker: TrackingService,
    private registry: ProviderRegistry = providerRegistry,
    private defaultPrefix = "git"
  ) {}

  // ------------------- Setup -------------------
  async handleSetup(
    ctx: CommandContext,
    options: {
      channelId?: string;
      commits?: boolean;
      issues?: boolean;
      prs?: boolean;
      releases?: boolean;
    }
  ): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply({ content: "The setup command can only be used inside a Discord server.", ephemeral: true });
      return;
    }

    if (!ctx.memberHasAdmin) {
      await ctx.reply({
        content: "You need `Manage Server` or `Administrator` permissions to configure Gitcord.",
        ephemeral: true,
      });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (options.channelId) updates.notification_channel_id = options.channelId;
    if (options.commits !== undefined) updates.commits_enabled = options.commits ? 1 : 0;
    if (options.issues !== undefined) updates.issues_enabled = options.issues ? 1 : 0;
    if (options.prs !== undefined) updates.prs_enabled = options.prs ? 1 : 0;
    if (options.releases !== undefined) updates.releases_enabled = options.releases ? 1 : 0;

    this.repo.updateGuildSettings(ctx.guildId, updates);
    const settings = this.repo.getGuildSettings(ctx.guildId);

    const channelDisplay = settings?.notification_channel_id ? `<#${settings.notification_channel_id}>` : "*None (set one with /git setup channel:#channel)*";

    const embed = new EmbedBuilder()
      .setColor(0x238636)
      .setTitle("Gitcord Server Configuration Updated")
      .setDescription(`Settings for this server have been saved:`)
      .addFields(
        { name: "Notification Channel", value: channelDisplay, inline: false },
        { name: "Commits Enabled", value: settings?.commits_enabled ? "✅ Yes" : "❌ No", inline: true },
        { name: "Issues Enabled", value: settings?.issues_enabled ? "✅ Yes" : "❌ No", inline: true },
        { name: "PRs / MRs Enabled", value: settings?.prs_enabled ? "✅ Yes" : "❌ No", inline: true },
        { name: "Releases Enabled", value: settings?.releases_enabled ? "✅ Yes" : "❌ No", inline: true }
      )
      .setFooter({ text: "Gitcord • Server Settings" });

    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- Instances -------------------
  async handleInstance(
    ctx: CommandContext,
    action: "list" | "add",
    url?: string,
    name?: string
  ): Promise<void> {
    if (action === "list") {
      const instances = this.repo.getAllInstances();
      const lines = instances.map((inst) => `• **${inst.name}** (\`${inst.provider_type}\`): ${inst.base_url}`);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Configured Git Instances")
        .setDescription(lines.join("\n") || "No instances configured.")
        .setFooter({ text: "Gitcord supports GitHub, GitLab, Gitea, Forgejo, and Generic Git instances" });

      await ctx.reply({ embeds: [embed] });
      return;
    }

    if (action === "add") {
      if (!ctx.memberHasAdmin) {
        await ctx.reply({ content: "Administrator permissions required to add Git instances.", ephemeral: true });
        return;
      }
      if (!url) {
        await ctx.reply({ content: "Please provide a valid instance base URL.", ephemeral: true });
        return;
      }

      const validation = validateGitInstanceUrl(url);
      if (!validation.valid || !validation.normalized) {
        await ctx.reply({ content: `Invalid instance URL: ${validation.error || "Forbidden address"}`, ephemeral: true });
        return;
      }

      const provider = await this.registry.resolveProviderForUrl(validation.normalized);
      const friendlyName = name || provider.name;

      this.repo.addInstance(friendlyName, validation.normalized, provider.type, 1);

      await ctx.reply({
        content: `Successfully registered Git instance **${friendlyName}** (${validation.normalized}) as \`${provider.type}\`.`,
      });
    }
  }

  // ------------------- Follow -------------------
  async handleFollow(
    ctx: CommandContext,
    targetInput: string,
    typeOverride?: "repository" | "user",
    instanceOverride?: string,
    channelOverride?: string
  ): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply({ content: "Tracking subscriptions must be configured within a server.", ephemeral: true });
      return;
    }

    const defaultInstance = instanceOverride || "https://github.com";
    const parsedRepo = parseRepositoryInput(targetInput, defaultInstance);

    const isRepo = typeOverride ? typeOverride === "repository" : parsedRepo !== null && targetInput.includes("/");
    const targetChannelId = channelOverride || ctx.channelId;

    if (isRepo && parsedRepo) {
      const instanceUrl = parsedRepo.instanceUrl;
      const provider = await this.registry.resolveProviderForUrl(instanceUrl, parsedRepo.providerHint);

      // Verify repository exists on provider
      const repoDetails = await provider.getRepository(instanceUrl, parsedRepo.owner, parsedRepo.name);
      if (!repoDetails) {
        await ctx.reply({
          content: `Could not locate repository \`${parsedRepo.owner}/${parsedRepo.name}\` on \`${instanceUrl}\`. Please check the spelling or instance accessibility.`,
          ephemeral: true,
        });
        return;
      }

      // Add tracked repo in database
      const tracked = this.repo.addTrackedRepo(instanceUrl, parsedRepo.owner, parsedRepo.name, repoDetails.defaultBranch);

      // Add subscription
      this.repo.addSubscription({
        guildId: ctx.guildId,
        channelId: targetChannelId,
        targetType: "repository",
        targetId: tracked.id,
      });

      const embed = new EmbedBuilder()
        .setColor(provider.color)
        .setTitle(`Now Monitoring: ${tracked.owner}/${tracked.name}`)
        .setDescription(
          `Successfully subscribed to repository activity.\nNotifications will be delivered to <#${targetChannelId}>.`
        )
        .addFields(
          { name: "Provider", value: provider.name, inline: true },
          { name: "Instance", value: new URL(instanceUrl).host, inline: true },
          { name: "Default Branch", value: `\`${repoDetails.defaultBranch}\``, inline: true }
        )
        .setFooter({ text: "Gitcord • Activity Tracker", iconURL: provider.iconUrl });

      await ctx.reply({ embeds: [embed] });
    } else {
      // User follow
      const username = targetInput.trim().replace(/^@/, "");
      const instanceUrl = instanceOverride || "https://github.com";
      const provider = await this.registry.resolveProviderForUrl(instanceUrl);

      const userProfile = await provider.getUser(instanceUrl, username);
      if (!userProfile) {
        await ctx.reply({
          content: `Could not locate user \`${username}\` on \`${instanceUrl}\`.`,
          ephemeral: true,
        });
        return;
      }

      const trackedUser = this.repo.addTrackedUser(
        instanceUrl,
        username,
        userProfile.displayName,
        userProfile.avatarUrl
      );

      this.repo.addSubscription({
        guildId: ctx.guildId,
        channelId: targetChannelId,
        targetType: "user",
        targetId: trackedUser.id,
      });

      const embed = new EmbedBuilder()
        .setColor(provider.color)
        .setTitle(`Now Monitoring User: ${userProfile.displayName || userProfile.username}`)
        .setDescription(
          `Successfully subscribed to user activity for **${username}**.\nNotifications will be delivered to <#${targetChannelId}>.`
        )
        .addFields(
          { name: "Provider", value: provider.name, inline: true },
          { name: "Instance", value: new URL(instanceUrl).host, inline: true }
        )
        .setFooter({ text: "Gitcord • User Tracker", iconURL: provider.iconUrl });

      if (userProfile.avatarUrl && userProfile.avatarUrl.startsWith("https://")) {
        embed.setThumbnail(userProfile.avatarUrl);
      }

      await ctx.reply({ embeds: [embed] });
    }
  }

  // ------------------- Unfollow -------------------
  async handleUnfollow(ctx: CommandContext, targetInput: string): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply({ content: "The unfollow command must be used within a server.", ephemeral: true });
      return;
    }

    const subscriptions = this.repo.getGuildSubscriptions(ctx.guildId);
    let removedCount = 0;

    for (const sub of subscriptions) {
      let matches = false;
      if (sub.target_type === "repository" && sub.repo_owner && sub.repo_name) {
        const full = `${sub.repo_owner}/${sub.repo_name}`.toLowerCase();
        if (full === targetInput.toLowerCase() || sub.repo_name.toLowerCase() === targetInput.toLowerCase()) {
          matches = true;
        }
      } else if (sub.target_type === "user" && sub.username) {
        if (sub.username.toLowerCase() === targetInput.toLowerCase()) {
          matches = true;
        }
      }

      if (matches) {
        this.repo.removeSubscription(ctx.guildId, sub.channel_id, sub.target_type, sub.target_id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await ctx.reply({ content: `Removed ${removedCount} subscription(s) for **${sanitizeText(targetInput, 60)}**.` });
    } else {
      await ctx.reply({
        content: `No active subscription matching **${sanitizeText(targetInput, 60)}** was found in this server. Use \`/git follows\` to inspect tracked items.`,
        ephemeral: true,
      });
    }
  }

  // ------------------- Follows -------------------
  async handleFollows(ctx: CommandContext): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply({ content: "This command must be used within a server.", ephemeral: true });
      return;
    }

    const subscriptions = this.repo.getGuildSubscriptions(ctx.guildId);

    if (subscriptions.length === 0) {
      await ctx.reply({
        content: `No Git repositories or users are currently tracked in this server. Use \`/git follow\` to start monitoring.`,
      });
      return;
    }

    const lines = subscriptions.map((s) => {
      const targetDisplay =
        s.target_type === "repository" ? `📦 **${s.repo_owner}/${s.repo_name}**` : `👤 **@${s.username}**`;
      const instanceHost = new URL(s.instance_url).host;
      return `${targetDisplay} (${instanceHost}) ➔ <#${s.channel_id}>`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Monitored Git Subscriptions")
      .setDescription(lines.join("\n"))
      .setFooter({ text: `${subscriptions.length} active subscription(s)` });

    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- Repository Info -------------------
  async handleRepository(ctx: CommandContext, repoInput: string): Promise<void> {
    const parsed = parseRepositoryInput(repoInput);
    if (!parsed) {
      await ctx.reply({ content: "Invalid repository format. Please specify `owner/repository` or a full URL.", ephemeral: true });
      return;
    }

    const provider = await this.registry.resolveProviderForUrl(parsed.instanceUrl, parsed.providerHint);
    const repoDetails = await provider.getRepository(parsed.instanceUrl, parsed.owner, parsed.name);

    if (!repoDetails) {
      await ctx.reply({ content: `Repository \`${parsed.owner}/${parsed.name}\` not found on \`${parsed.instanceUrl}\`.`, ephemeral: true });
      return;
    }

    const embed = buildRepositoryEmbed(repoDetails, provider.getBrandInfo());
    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- Commits -------------------
  async handleCommits(ctx: CommandContext, repoInput: string, branch?: string, limit = 5): Promise<void> {
    const parsed = parseRepositoryInput(repoInput);
    if (!parsed) {
      await ctx.reply({ content: "Invalid repository format. Please specify `owner/repository` or a full URL.", ephemeral: true });
      return;
    }

    const provider = await this.registry.resolveProviderForUrl(parsed.instanceUrl, parsed.providerHint);
    const commits = await provider.getRecentCommits(parsed.instanceUrl, parsed.owner, parsed.name, {
      branch,
      limit: Math.min(limit, 15),
    });

    if (commits.length === 0) {
      await ctx.reply({ content: `No commits found for \`${parsed.owner}/${parsed.name}\`.`, ephemeral: true });
      return;
    }

    const lines = commits.map((c) => {
      const commitLink = c.url ? `[\`${c.shortId}\`](${c.url})` : `\`${c.shortId}\``;
      const dateStr = c.date.split("T")[0] || c.date;
      return `${commitLink} — **${sanitizeText(c.message, 60)}** (${c.author}, ${dateStr})`;
    });

    const embed = new EmbedBuilder()
      .setColor(provider.color)
      .setTitle(`Recent Commits — ${parsed.owner}/${parsed.name}`)
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `${provider.name} Commits`, iconURL: provider.iconUrl });

    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- Issues -------------------
  async handleIssues(
    ctx: CommandContext,
    repoInput: string,
    state: "open" | "closed" | "all" = "open",
    limit = 5
  ): Promise<void> {
    const parsed = parseRepositoryInput(repoInput);
    if (!parsed) {
      await ctx.reply({ content: "Invalid repository format. Please specify `owner/repository` or a full URL.", ephemeral: true });
      return;
    }

    const provider = await this.registry.resolveProviderForUrl(parsed.instanceUrl, parsed.providerHint);
    const issues = await provider.getRecentIssues(parsed.instanceUrl, parsed.owner, parsed.name, {
      state,
      limit: Math.min(limit, 10),
    });

    if (issues.length === 0) {
      await ctx.reply({ content: `No issues (${state}) found for \`${parsed.owner}/${parsed.name}\`.` });
      return;
    }

    const lines = issues.map((iss) => {
      const link = iss.issue.url ? `[#${iss.issue.number}](${iss.issue.url})` : `#${iss.issue.number}`;
      const stateIcon = iss.action === "closed" ? "🟣" : "🟢";
      return `${stateIcon} ${link} — **${sanitizeText(iss.issue.title, 60)}** by *${iss.author.username}*`;
    });

    const embed = new EmbedBuilder()
      .setColor(provider.color)
      .setTitle(`Issues (${state}) — ${parsed.owner}/${parsed.name}`)
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `${provider.name} Issues`, iconURL: provider.iconUrl });

    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- Pull Requests -------------------
  async handlePullRequests(
    ctx: CommandContext,
    repoInput: string,
    state: "open" | "closed" | "all" = "open",
    limit = 5
  ): Promise<void> {
    const parsed = parseRepositoryInput(repoInput);
    if (!parsed) {
      await ctx.reply({ content: "Invalid repository format. Please specify `owner/repository` or a full URL.", ephemeral: true });
      return;
    }

    const provider = await this.registry.resolveProviderForUrl(parsed.instanceUrl, parsed.providerHint);
    const prs = await provider.getRecentPullRequests(parsed.instanceUrl, parsed.owner, parsed.name, {
      state,
      limit: Math.min(limit, 10),
    });

    const term = provider.name === "GitLab" ? "Merge Requests" : "Pull Requests";

    if (prs.length === 0) {
      await ctx.reply({ content: `No ${term.toLowerCase()} (${state}) found for \`${parsed.owner}/${parsed.name}\`.` });
      return;
    }

    const lines = prs.map((pr) => {
      const link = pr.pullRequest.url ? `[#${pr.pullRequest.number}](${pr.pullRequest.url})` : `#${pr.pullRequest.number}`;
      const stateIcon = pr.action === "merged" ? "🟣" : pr.action === "closed" ? "🔴" : "🟢";
      return `${stateIcon} ${link} — **${sanitizeText(pr.pullRequest.title, 60)}** by *${pr.author.username}*`;
    });

    const embed = new EmbedBuilder()
      .setColor(provider.color)
      .setTitle(`${term} (${state}) — ${parsed.owner}/${parsed.name}`)
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `${provider.name} ${term}`, iconURL: provider.iconUrl });

    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- History (Paginated) -------------------
  async handleHistory(ctx: CommandContext, repoInput: string, limit = 20): Promise<void> {
    const parsed = parseRepositoryInput(repoInput);
    if (!parsed) {
      await ctx.reply({ content: "Invalid repository format. Please specify `owner/repository` or a full URL.", ephemeral: true });
      return;
    }

    const provider = await this.registry.resolveProviderForUrl(parsed.instanceUrl, parsed.providerHint);
    const commits = await provider.getRecentCommits(parsed.instanceUrl, parsed.owner, parsed.name, {
      limit: Math.min(limit, 30),
    });

    if (commits.length === 0) {
      await ctx.reply({ content: `No commit history found for \`${parsed.owner}/${parsed.name}\`.` });
      return;
    }

    const target = ctx.interaction || ctx.message;
    if (target) {
      await sendPaginatedHistory(target, `${parsed.owner}/${parsed.name}`, commits, provider.getBrandInfo(), 5);
    }
  }

  // ------------------- Branches -------------------
  async handleBranches(ctx: CommandContext, repoInput: string): Promise<void> {
    const parsed = parseRepositoryInput(repoInput);
    if (!parsed) {
      await ctx.reply({ content: "Invalid repository format.", ephemeral: true });
      return;
    }

    const provider = await this.registry.resolveProviderForUrl(parsed.instanceUrl, parsed.providerHint);
    const branches = await provider.getBranches(parsed.instanceUrl, parsed.owner, parsed.name);

    if (branches.length === 0) {
      await ctx.reply({ content: `No branches found for \`${parsed.owner}/${parsed.name}\`.` });
      return;
    }

    const lines = branches.map((b) => `• \`${b.name}\` (\`${b.commitSha.substring(0, 7)}\`)`);

    const embed = new EmbedBuilder()
      .setColor(provider.color)
      .setTitle(`Branches — ${parsed.owner}/${parsed.name}`)
      .setDescription(lines.join("\n"))
      .setFooter({ text: `${provider.name} Branches`, iconURL: provider.iconUrl });

    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- User Info -------------------
  async handleUser(ctx: CommandContext, username: string, instanceUrl = "https://github.com"): Promise<void> {
    const provider = await this.registry.resolveProviderForUrl(instanceUrl);
    const user = await provider.getUser(instanceUrl, username);

    if (!user) {
      await ctx.reply({ content: `User \`${username}\` not found on \`${instanceUrl}\`.`, ephemeral: true });
      return;
    }

    const embed = buildUserEmbed(user, provider.getBrandInfo());
    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- Status -------------------
  async handleStatus(ctx: CommandContext, pingMs = 0): Promise<void> {
    const stats = this.tracker.getStats();
    let dbHealthy = true;
    try {
      this.repo.getStats();
    } catch {
      dbHealthy = false;
    }

    const embed = buildSystemEmbed(stats, pingMs, dbHealthy);
    await ctx.reply({ embeds: [embed] });
  }

  // ------------------- Help -------------------
  async handleHelp(ctx: CommandContext): Promise<void> {
    const embed = buildOnboardingEmbed(this.defaultPrefix);
    await ctx.reply({ embeds: [embed] });
  }
}
