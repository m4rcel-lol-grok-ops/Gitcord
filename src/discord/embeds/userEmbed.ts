import { EmbedBuilder } from "discord.js";
import { GitUser } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { sanitizeText, formatNumber } from "../../utils/sanitize";

export function buildUserEmbed(user: GitUser, brand: ProviderBrandInfo): EmbedBuilder {
  const embed = new EmbedBuilder();

  embed.setColor(brand.color);
  embed.setTitle(`${user.displayName || user.username} (@${user.username})`);
  if (user.profileUrl) {
    embed.setURL(user.profileUrl);
  }

  if (user.avatarUrl && user.avatarUrl.startsWith("https://")) {
    embed.setThumbnail(user.avatarUrl);
  }

  const bio = user.bio ? sanitizeText(user.bio, 300) : "*No bio provided.*";
  embed.setDescription(bio);

  embed.addFields(
    { name: "Git Instance", value: new URL(user.instanceUrl).host, inline: true },
    { name: "Username", value: user.username, inline: true }
  );

  const statsList: string[] = [];
  if (user.repositoriesCount !== undefined) statsList.push(`📦 **Repos:** ${formatNumber(user.repositoriesCount)}`);
  if (user.followersCount !== undefined) statsList.push(`👥 **Followers:** ${formatNumber(user.followersCount)}`);
  if (user.followingCount !== undefined) statsList.push(`➡️ **Following:** ${formatNumber(user.followingCount)}`);

  if (statsList.length > 0) {
    embed.addFields({ name: "Activity", value: statsList.join(" | "), inline: false });
  }

  embed.setFooter({
    text: `${brand.name} User`,
    iconURL: brand.iconUrl,
  });

  return embed;
}
