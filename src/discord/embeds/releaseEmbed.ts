import { EmbedBuilder } from "discord.js";
import { ReleaseEvent } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { sanitizeText } from "../../utils/sanitize";

export function buildReleaseEmbed(event: ReleaseEvent, brand: ProviderBrandInfo): EmbedBuilder {
  const embed = new EmbedBuilder();

  embed.setColor(0x0969da); // Blue for releases

  const repoDisplay = `${event.repository.owner}/${event.repository.name}`;
  embed.setTitle(`[${repoDisplay}] Release: ${sanitizeText(event.release.name || event.release.tagName, 80)}`);
  if (event.release.url) {
    embed.setURL(event.release.url);
  }

  const descLines: string[] = [`🏷️ **Tag:** \`${event.release.tagName}\``];
  if (event.release.author) {
    descLines.push(`👤 **Author:** ${sanitizeText(event.release.author, 50)}`);
  }
  if (event.release.bodyPreview) {
    descLines.push("", `> ${sanitizeText(event.release.bodyPreview, 300).replace(/\n/g, "\n> ")}`);
  }
  embed.setDescription(descLines.join("\n"));

  if (event.release.publishedAt) {
    const dateObj = new Date(event.release.publishedAt);
    if (!isNaN(dateObj.getTime())) {
      embed.setTimestamp(dateObj);
    }
  }

  embed.setFooter({
    text: `${brand.name} Release`,
    iconURL: brand.iconUrl,
  });

  return embed;
}
