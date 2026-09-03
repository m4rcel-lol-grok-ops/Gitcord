import { EmbedBuilder } from "discord.js";
import { GitRepository } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { sanitizeText, formatNumber } from "../../utils/sanitize";

export function buildRepositoryEmbed(repo: GitRepository, brand: ProviderBrandInfo): EmbedBuilder {
  const embed = new EmbedBuilder();

  embed.setColor(brand.color);
  embed.setTitle(repo.fullName);
  if (repo.url) {
    embed.setURL(repo.url);
  }

  const desc = repo.description ? sanitizeText(repo.description, 350) : "*No description provided.*";
  embed.setDescription(desc);

  embed.addFields(
    { name: "Owner", value: sanitizeText(repo.owner, 50), inline: true },
    { name: "Default Branch", value: `\`${repo.defaultBranch}\``, inline: true },
    { name: "Git Instance", value: new URL(repo.instanceUrl).host, inline: true }
  );

  const statsList: string[] = [];
  if (repo.starsCount !== undefined) statsList.push(`⭐ **Stars:** ${formatNumber(repo.starsCount)}`);
  if (repo.forksCount !== undefined) statsList.push(`🍴 **Forks:** ${formatNumber(repo.forksCount)}`);
  if (repo.openIssuesCount !== undefined) statsList.push(`❗ **Issues:** ${formatNumber(repo.openIssuesCount)}`);
  if (repo.license) statsList.push(`📜 **License:** ${repo.license}`);

  if (statsList.length > 0) {
    embed.addFields({ name: "Statistics", value: statsList.join(" | "), inline: false });
  }

  if (repo.lastActivityAt) {
    const dateObj = new Date(repo.lastActivityAt);
    if (!isNaN(dateObj.getTime())) {
      embed.setTimestamp(dateObj);
    }
  }

  embed.setFooter({
    text: `${brand.name} Repository`,
    iconURL: brand.iconUrl,
  });

  return embed;
}
