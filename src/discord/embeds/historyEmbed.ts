import { EmbedBuilder } from "discord.js";
import { GitCommitSummary } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { sanitizeText } from "../../utils/sanitize";

export function buildHistoryEmbed(
  repoFullName: string,
  commits: GitCommitSummary[],
  brand: ProviderBrandInfo,
  page = 1,
  totalPages = 1
): EmbedBuilder {
  const embed = new EmbedBuilder();

  embed.setColor(brand.color);
  embed.setTitle(`Commit History — ${repoFullName}`);

  if (commits.length === 0) {
    embed.setDescription("No recent commits found.");
  } else {
    const lines = commits.map((c) => {
      const commitLink = c.url ? `[\`${c.shortId}\`](${c.url})` : `\`${c.shortId}\``;
      const dateStr = c.date.split("T")[0] || c.date;
      return `${commitLink} — **${sanitizeText(c.message, 60)}**\n${dateStr} — *${sanitizeText(c.author, 40)}*`;
    });

    embed.setDescription(lines.join("\n\n"));
  }

  embed.setFooter({
    text: `${brand.name} • Page ${page} of ${totalPages}`,
    iconURL: brand.iconUrl,
  });

  return embed;
}
