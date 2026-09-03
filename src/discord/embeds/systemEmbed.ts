import { EmbedBuilder } from "discord.js";
import { TrackingServiceStats } from "../../git/tracker/TrackingService";

export function buildSystemEmbed(
  stats: TrackingServiceStats,
  pingMs: number,
  dbHealthy: boolean
): EmbedBuilder {
  const embed = new EmbedBuilder();

  embed.setColor(0x5865f2); // Discord Blurple
  embed.setTitle("Gitcord — System Health & Status");

  const lastCycleText = stats.lastPollCycleAt
    ? `<t:${Math.floor(stats.lastPollCycleAt.getTime() / 1000)}:R> (${stats.lastPollDurationMs}ms)`
    : "Pending first run";

  embed.addFields(
    { name: "Gitcord Tracker", value: stats.isRunning ? "🟢 Active" : "🔴 Stopped", inline: true },
    { name: "Discord Gateway", value: `🟢 Connected (${pingMs}ms)`, inline: true },
    { name: "Database", value: dbHealthy ? "🟢 Reachable (SQLite)" : "🔴 Unreachable", inline: true },
    { name: "Polling Interval", value: `⏱️ Every ${stats.pollIntervalSeconds}s`, inline: true },
    { name: "Last Poll Cycle", value: lastCycleText, inline: true },
    { name: "Events Processed", value: stats.totalEventsProcessed.toLocaleString(), inline: true },
    { name: "Tracked Repos", value: stats.trackedReposCount.toString(), inline: true },
    { name: "Tracked Users", value: stats.trackedUsersCount.toString(), inline: true },
    { name: "Mode", value: "🔒 Strictly Read-Only", inline: true }
  );

  embed.setTimestamp();
  embed.setFooter({ text: "Gitcord • Production Git Integration" });

  return embed;
}
