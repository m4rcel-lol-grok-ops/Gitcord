import { EmbedBuilder } from "discord.js";
import { PullRequestEvent } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { sanitizeText } from "../../utils/sanitize";

export function buildPullRequestEmbed(event: PullRequestEvent, brand: ProviderBrandInfo): EmbedBuilder {
  const embed = new EmbedBuilder();

  // Color by action: purple for merged, red for closed unmerged, green for opened
  let color = brand.color;
  if (event.action === "merged") color = 0x8957e5;
  else if (event.action === "closed") color = 0xda3633;
  else if (event.action === "opened" || event.action === "reopened") color = 0x238636;
  embed.setColor(color);

  const term = brand.name === "GitLab" ? "Merge Request" : "Pull Request";
  const repoDisplay = `${event.repository.owner}/${event.repository.name}`;

  embed.setTitle(`[${repoDisplay}] ${term} #${event.pullRequest.number}: ${sanitizeText(event.pullRequest.title, 100)}`);
  if (event.pullRequest.url) {
    embed.setURL(event.pullRequest.url);
  }

  const actionText =
    event.action === "merged"
      ? "Merged"
      : event.action === "closed"
      ? "Closed"
      : event.action === "reopened"
      ? "Reopened"
      : "Opened";

  if (event.author.avatarUrl && event.author.avatarUrl.startsWith("https://")) {
    embed.setThumbnail(event.author.avatarUrl);
  }

  const descLines: string[] = [`**Status:** ${actionText}`];
  if (event.pullRequest.bodyPreview) {
    descLines.push("", `> ${sanitizeText(event.pullRequest.bodyPreview, 280).replace(/\n/g, "\n> ")}`);
  }
  embed.setDescription(descLines.join("\n"));

  embed.addFields(
    { name: "Author", value: sanitizeText(event.author.displayName || event.author.username, 50), inline: true },
    { name: "State", value: event.pullRequest.state, inline: true }
  );

  if (event.pullRequest.date) {
    const dateObj = new Date(event.pullRequest.date);
    if (!isNaN(dateObj.getTime())) {
      embed.setTimestamp(dateObj);
    }
  }

  embed.setFooter({
    text: `${brand.name} ${term}`,
    iconURL: brand.iconUrl,
  });

  return embed;
}
