import { EmbedBuilder } from "discord.js";
import { CommitEvent } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { sanitizeText, formatNumber } from "../../utils/sanitize";

export function buildCommitEmbed(event: CommitEvent, brand: ProviderBrandInfo): EmbedBuilder {
  const embed = new EmbedBuilder();

  embed.setColor(brand.color);

  // Prominently feature username/repository
  const repoDisplay = `${event.repository.owner}/${event.repository.name}`;
  embed.setTitle(repoDisplay);
  if (event.repository.url) {
    embed.setURL(event.repository.url);
  }

  // Source instance
  const instanceHost = new URL(event.instance).host;
  const fromDisplay = `From: ${instanceHost === "github.com" ? "GitHub" : instanceHost === "gitlab.com" ? "GitLab" : instanceHost}`;

  // Author avatar thumbnail (MUST use direct HTTPS URL from provider per Section 10)
  if (event.author.avatarUrl && event.author.avatarUrl.startsWith("https://")) {
    embed.setThumbnail(event.author.avatarUrl);
  }

  // Build description content
  const descLines: string[] = [fromDisplay, ""];

  // File change stats
  if (event.statistics.isUnavailable) {
    descLines.push("*Statistics unavailable*");
  } else {
    descLines.push(`**Files changed:** ${formatNumber(event.statistics.filesChanged)}`);
    if (event.statistics.filesAdded !== undefined) {
      descLines.push(`**Added:** ${formatNumber(event.statistics.filesAdded)}`);
    }
    if (event.statistics.filesDeleted !== undefined) {
      descLines.push(`**Removed:** ${formatNumber(event.statistics.filesDeleted)}`);
    }

    // Diff-style statistics block
    if (event.statistics.linesAdded !== undefined || event.statistics.linesRemoved !== undefined) {
      descLines.push("");
      descLines.push("```diff");
      if (event.statistics.linesAdded !== undefined) {
        descLines.push(`+ ${formatNumber(event.statistics.linesAdded)}`);
      }
      if (event.statistics.linesRemoved !== undefined) {
        descLines.push(`- ${formatNumber(event.statistics.linesRemoved)}`);
      }
      descLines.push("```");
    }
  }

  // Commit message
  descLines.push("");
  descLines.push(`**${sanitizeText(event.commit.message, 250)}**`);

  embed.setDescription(descLines.join("\n"));

  // Commit info fields
  const commitLink = event.commit.url
    ? `[\`${event.commit.shortId}\`](${event.commit.url})`
    : `\`${event.commit.shortId}\``;

  embed.addFields(
    { name: "Commit", value: commitLink, inline: true },
    { name: "Author", value: sanitizeText(event.author.displayName || event.author.username, 50), inline: true }
  );

  // Timestamp
  if (event.commit.date) {
    const dateObj = new Date(event.commit.date);
    if (!isNaN(dateObj.getTime())) {
      embed.setTimestamp(dateObj);
    }
  }

  // Footer with provider branding
  embed.setFooter({
    text: `${brand.name} Commit`,
    iconURL: brand.iconUrl,
  });

  return embed;
}
