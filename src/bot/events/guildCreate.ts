import { ChannelType, Guild, PermissionFlagsBits } from "discord.js";
import { DatabaseRepository } from "../../database/repository";
import { buildOnboardingEmbed } from "../../discord/embeds";
import { logger } from "../../utils/logger";

export async function handleGuildCreate(
  guild: Guild,
  repo: DatabaseRepository,
  prefix = "git"
): Promise<void> {
  logger.info(`Joined guild: ${guild.name} (${guild.id})`);

  // Ensure guild is in database
  const guildRecord = repo.upsertGuild(guild.id, guild.name);

  // Only send the onboarding message once per guild unless reset
  if (guildRecord.has_onboarded === 1) {
    logger.debug(`Guild ${guild.name} has already onboarded. Skipping welcome message.`);
    return;
  }

  // Find suitable channel to send welcome message
  let targetChannel = guild.systemChannel;

  const botMember = guild.members.me;
  if (!botMember) {
    logger.warn(`Could not find bot member in guild ${guild.name}`);
    return;
  }

  const canSendInChannel = (channel: any): boolean => {
    if (!channel || channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      return false;
    }
    const permissions = channel.permissionsFor(botMember);
    return (
      permissions !== null &&
      permissions.has(PermissionFlagsBits.SendMessages) &&
      permissions.has(PermissionFlagsBits.EmbedLinks)
    );
  };

  if (!canSendInChannel(targetChannel)) {
    targetChannel = null;
    for (const [, channel] of guild.channels.cache) {
      if (canSendInChannel(channel)) {
        targetChannel = channel as any;
        break;
      }
    }
  }

  if (!targetChannel) {
    logger.warn(`No writable text channel with EmbedLinks found in ${guild.name} to post onboarding message.`);
    return;
  }

  try {
    const embed = buildOnboardingEmbed(prefix);
    await targetChannel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    repo.markGuildOnboarded(guild.id);
    logger.info(`Onboarding message successfully sent to guild ${guild.name} in channel #${targetChannel.name}`);
  } catch (err) {
    logger.error(`Failed to send onboarding message in ${guild.name}`, err);
  }
}
