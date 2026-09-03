import { Client, TextChannel } from "discord.js";
import { NormalizedGitEvent } from "../git/models";
import { SubscriptionRecord } from "../database/repository";
import { ProviderRegistry, providerRegistry } from "../git/providers";
import {
  buildCommitEmbed,
  buildIssueEmbed,
  buildPullRequestEmbed,
  buildReleaseEmbed,
} from "../discord/embeds";
import { logger } from "../utils/logger";

export class NotificationDispatcher {
  constructor(
    private client: Client,
    private registry: ProviderRegistry = providerRegistry
  ) {}

  async dispatch(event: NormalizedGitEvent, subscriptions: SubscriptionRecord[]): Promise<void> {
    // Collect unique channels to send to
    const channelIds = Array.from(new Set(subscriptions.map((s) => s.channel_id)));

    const provider = await this.registry.resolveProviderForUrl(event.instance, event.provider);
    const brand = provider.getBrandInfo();

    let embed;
    if (event.type === "commit") {
      embed = buildCommitEmbed(event, brand);
    } else if (event.type === "issue") {
      embed = buildIssueEmbed(event, brand);
    } else if (event.type === "pull_request") {
      embed = buildPullRequestEmbed(event, brand);
    } else if (event.type === "release") {
      embed = buildReleaseEmbed(event, brand);
    }

    if (!embed) return;

    for (const channelId of channelIds) {
      try {
        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (!channel || !(channel instanceof TextChannel)) {
          logger.warn(`Notification channel ${channelId} not found or not a text channel.`);
          continue;
        }

        await channel.send({
          embeds: [embed],
          allowedMentions: { parse: [] }, // Never allow pinging @everyone or roles
        });

        logger.info(`Dispatched ${event.type} notification to channel #${channel.name} (${channelId})`);
      } catch (err) {
        logger.error(`Failed to send event notification to channel ${channelId}`, err);
      }
    }
  }
}
