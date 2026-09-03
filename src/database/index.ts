import { SqliteAdapter, DatabaseAdapter } from "./adapter";
import { runMigrations } from "./migrator";
import { DatabaseRepository } from "./repository";
import { config } from "../config";
import { logger } from "../utils/logger";

let adapterInstance: DatabaseAdapter | null = null;
let repositoryInstance: DatabaseRepository | null = null;

export function initDatabase(dbPath?: string): { db: DatabaseAdapter; repo: DatabaseRepository } {
  if (repositoryInstance && adapterInstance && !dbPath) {
    return { db: adapterInstance, repo: repositoryInstance };
  }

  const targetPath = dbPath || config.databaseUrl;
  logger.info(`Connecting to database at ${targetPath}`);

  const adapter = new SqliteAdapter(targetPath);
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
