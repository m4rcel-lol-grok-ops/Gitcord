import dotenv from "dotenv";
dotenv.config();

export interface Config {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  prefix: string;
  databaseUrl: string;
  pollIntervalSeconds: number;
  logLevel: "debug" | "info" | "warn" | "error";
  githubToken?: string;
  gitlabToken?: string;
  giteaToken?: string;
  forgejoToken?: string;
}

export function loadConfig(): Config {
  const rawPollInterval = process.env.POLL_INTERVAL_SECONDS || process.env.POLL_INTERVAL || "60";
  const pollInterval = parseInt(rawPollInterval, 10);

  // Backward compatibility: accept legacy DATABASE_PATH, TOKEN, BOT_TOKEN, etc.
  const rawDb = process.env.DATABASE_URL || process.env.DATABASE_PATH || "./data/gitcord.sqlite";
  const rawToken = process.env.DISCORD_TOKEN || process.env.TOKEN || process.env.BOT_TOKEN || "";
  const rawClientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || process.env.APPLICATION_ID || "";
  const rawPrefix = process.env.PREFIX || process.env.BOT_PREFIX || "git";

  return {
    discordToken: rawToken.trim(),
    discordClientId: rawClientId.trim(),
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    prefix: rawPrefix.trim(),
    databaseUrl: rawDb.trim(),
    pollIntervalSeconds: Number.isFinite(pollInterval) && pollInterval > 5 ? pollInterval : 60,
    logLevel: (process.env.LOG_LEVEL?.toLowerCase() as Config["logLevel"]) || "info",
    githubToken: process.env.GITHUB_TOKEN?.trim() || undefined,
    gitlabToken: process.env.GITLAB_TOKEN?.trim() || undefined,
    giteaToken: process.env.GITEA_TOKEN?.trim() || undefined,
    forgejoToken: process.env.FORGEJO_TOKEN?.trim() || undefined,
  };
}

export const config = loadConfig();
