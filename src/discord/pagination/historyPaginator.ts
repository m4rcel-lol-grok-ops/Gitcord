import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Message,
} from "discord.js";
import { GitCommitSummary } from "../../git/models";
import { ProviderBrandInfo } from "../../git/providers/GitProvider";
import { buildHistoryEmbed } from "../embeds/historyEmbed";
import { logger } from "../../utils/logger";

export async function sendPaginatedHistory(
  target: CommandInteraction | Message,
  repoFullName: string,
  allCommits: GitCommitSummary[],
  brand: ProviderBrandInfo,
  pageSize = 5
): Promise<void> {
  const totalPages = Math.max(1, Math.ceil(allCommits.length / pageSize));
  let currentPage = 1;

  const getPageCommits = (page: number): GitCommitSummary[] => {
    const start = (page - 1) * pageSize;
    return allCommits.slice(start, start + pageSize);
  };

  const createRow = (page: number): ActionRowBuilder<ButtonBuilder> => {
    const prevButton = new ButtonBuilder()
      .setCustomId("history_prev")
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1);

    const nextButton = new ButtonBuilder()
      .setCustomId("history_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
  };

  const embed = buildHistoryEmbed(repoFullName, getPageCommits(currentPage), brand, currentPage, totalPages);
  const row = createRow(currentPage);

  let replyMessage: Message;
  if (target instanceof Message) {
    replyMessage = await target.reply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
      allowedMentions: { parse: [] },
    });
  } else {
    const response = await target.reply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
      allowedMentions: { parse: [] },
      fetchReply: true,
    });
    replyMessage = response as Message;
  }

  if (totalPages <= 1) return;

  const collector = replyMessage.createMessageComponentCollector({
    time: 120000, // 2 minutes
  });

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.customId === "history_prev" && currentPage > 1) {
        currentPage--;
      } else if (interaction.customId === "history_next" && currentPage < totalPages) {
        currentPage++;
      }

      const newEmbed = buildHistoryEmbed(
        repoFullName,
        getPageCommits(currentPage),
        brand,
        currentPage,
        totalPages
      );
      const newRow = createRow(currentPage);

      await interaction.update({
        embeds: [newEmbed],
        components: [newRow],
      });
    } catch (err) {
      logger.error("Error in history pagination collector", err);
    }
  });

  collector.on("end", async () => {
    try {
      // Disable buttons on expiry
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("history_prev").setLabel("◀ Previous").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("history_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(true)
      );
      await replyMessage.edit({ components: [disabledRow] });
    } catch {
      // Message may have been deleted by user
    }
  });
}
