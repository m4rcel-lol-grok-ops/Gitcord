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
  const pollInterval = parseInt(process.env.POLL_INTERVAL_SECONDS || "60", 10);

  return {
    discordToken: process.env.DISCORD_TOKEN || "",
    discordClientId: process.env.DISCORD_CLIENT_ID || "",
    discordGuildId: process.env.DISCORD_GUILD_ID || undefined,
    prefix: (process.env.PREFIX || "git").trim(),
    databaseUrl: process.env.DATABASE_URL || "./data/gitcord.sqlite",
    pollIntervalSeconds: Number.isFinite(pollInterval) && pollInterval > 5 ? pollInterval : 60,
    logLevel: (process.env.LOG_LEVEL?.toLowerCase() as Config["logLevel"]) || "info",
    githubToken: process.env.GITHUB_TOKEN?.trim() || undefined,
    gitlabToken: process.env.GITLAB_TOKEN?.trim() || undefined,
    giteaToken: process.env.GITEA_TOKEN?.trim() || undefined,
    forgejoToken: process.env.FORGEJO_TOKEN?.trim() || undefined,
  };
}

export const config = loadConfig();
