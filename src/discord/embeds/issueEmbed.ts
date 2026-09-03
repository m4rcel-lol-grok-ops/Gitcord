import { EmbedBuilder } from "discord.js";
import { IssueEvent } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { sanitizeText } from "../../utils/sanitize";

export function buildIssueEmbed(event: IssueEvent, brand: ProviderBrandInfo): EmbedBuilder {
  const embed = new EmbedBuilder();

  // Color by action
  let color = brand.color;
  if (event.action === "closed") color = 0x8957e5; // Purple for closed
  else if (event.action === "reopened") color = 0x238636; // Green for opened/reopened
  embed.setColor(color);

  const repoDisplay = `${event.repository.owner}/${event.repository.name}`;
  embed.setTitle(`[${repoDisplay}] Issue #${event.issue.number}: ${sanitizeText(event.issue.title, 100)}`);
  if (event.issue.url) {
    embed.setURL(event.issue.url);
  }

  const actionText = event.action === "closed" ? "Closed" : event.action === "reopened" ? "Reopened" : "Opened";

  if (event.author.avatarUrl && event.author.avatarUrl.startsWith("https://")) {
    embed.setThumbnail(event.author.avatarUrl);
  }

  const descLines: string[] = [`**Status:** ${actionText}`];
  if (event.issue.bodyPreview) {
    descLines.push("", `> ${sanitizeText(event.issue.bodyPreview, 280).replace(/\n/g, "\n> ")}`);
  }
  embed.setDescription(descLines.join("\n"));

  embed.addFields(
    { name: "Author", value: sanitizeText(event.author.displayName || event.author.username, 50), inline: true },
    { name: "State", value: event.issue.state, inline: true }
  );

  if (event.issue.date) {
    const dateObj = new Date(event.issue.date);
    if (!isNaN(dateObj.getTime())) {
      embed.setTimestamp(dateObj);
    }
  }

  embed.setFooter({
    text: `${brand.name} Issue`,
    iconURL: brand.iconUrl,
  });

  return embed;
}
