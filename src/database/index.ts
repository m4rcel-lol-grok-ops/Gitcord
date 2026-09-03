import fs from "fs";
import path from "path";
import { SqliteAdapter, DatabaseAdapter } from "./adapter";
import { runMigrations } from "./migrator";
import { DatabaseRepository } from "./repository";
import { config } from "../config";
import { logger } from "../utils/logger";

let adapterInstance: DatabaseAdapter | null = null;
let repositoryInstance: DatabaseRepository | null = null;

/**
 * Normalizes the database URL, stripping prefixes (sqlite://, file:)
 * and gracefully handling old PostgreSQL connection strings by falling back to SQLite.
 */
export function resolveDatabasePath(rawUrl?: string): string {
  const isDockerDataDir = fs.existsSync("/app/data");
  const defaultPath = isDockerDataDir ? "/app/data/gitcord.sqlite" : "./data/gitcord.sqlite";

  if (!rawUrl || rawUrl.trim() === "") {
    return defaultPath;
  }

  const trimmed = rawUrl.trim();

  // If old .env contained PostgreSQL connection string
  if (trimmed.startsWith("postgres://") || trimmed.startsWith("postgresql://")) {
    logger.warn(
      `DATABASE_URL is set to a PostgreSQL URL ("${trimmed.split("@")[1] || "postgres"}"), ` +
      `but Gitcord is currently configured to run on SQLite. Falling back to SQLite database at: ${defaultPath}`
    );
    return defaultPath;
  }

  // Strip URI prefixes like sqlite:///..., sqlite://..., file://..., file:...
  let cleaned = trimmed
    .replace(/^sqlite:\/\/\//i, "/")
    .replace(/^sqlite:\/\//i, "")
    .replace(/^sqlite:/i, "")
    .replace(/^file:\/\/\//i, "/")
    .replace(/^file:\/\//i, "")
    .replace(/^file:/i, "");

  // If in Docker container and path is relative data/..., ensure it maps to persistent /app/data
  if (isDockerDataDir && (cleaned === "./data/gitcord.sqlite" || cleaned === "data/gitcord.sqlite")) {
    cleaned = "/app/data/gitcord.sqlite";
  }

  // Memory database for tests
  if (cleaned === ":memory:") {
    return ":memory:";
  }

  return cleaned || defaultPath;
}

export function initDatabase(dbPath?: string): { db: DatabaseAdapter; repo: DatabaseRepository } {
  if (repositoryInstance && adapterInstance && !dbPath) {
    return { db: adapterInstance, repo: repositoryInstance };
  }

  const rawPath = dbPath || config.databaseUrl;
  const targetPath = resolveDatabasePath(rawPath);
  logger.info(`Connecting to database at ${targetPath}`);

  let adapter: SqliteAdapter;
  try {
    adapter = new SqliteAdapter(targetPath);
  } catch (err) {
    logger.warn(`Failed to open database at ${targetPath}: ${(err as Error).message}. Attempting fallback...`);
    const fallbackPath = targetPath === ":memory:" ? ":memory:" : "./gitcord.sqlite";
    adapter = new SqliteAdapter(fallbackPath);
  }

  runMigrations(adapter);

  const repo = new DatabaseRepository(adapter);

  // Seed default git instances
  repo.addInstance("GitHub", "https://github.com", "github", 0);
  repo.addInstance("GitLab", "https://gitlab.com", "gitlab", 0);
  repo.addInstance("Codeberg", "https://codeberg.org", "forgejo", 0);

  adapterInstance = adapter;
  repositoryInstance = repo;

  return { db: adapter, repo };
}

export function getRepository(): DatabaseRepository {
  if (!repositoryInstance) {
    return initDatabase().repo;
  }
  return repositoryInstance;
}

export { DatabaseAdapter, SqliteAdapter, DatabaseRepository };
