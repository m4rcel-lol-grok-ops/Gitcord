import fs from "fs";
import path from "path";
import { DatabaseAdapter } from "./adapter";
import { logger } from "../utils/logger";

const FALLBACK_MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  has_onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  notification_channel_id TEXT,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 60,
  commits_enabled INTEGER NOT NULL DEFAULT 1,
  issues_enabled INTEGER NOT NULL DEFAULT 1,
  prs_enabled INTEGER NOT NULL DEFAULT 1,
  repos_enabled INTEGER NOT NULL DEFAULT 1,
  releases_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS git_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  base_url TEXT UNIQUE NOT NULL,
  provider_type TEXT NOT NULL,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracked_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_url TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  last_checked_at TEXT,
  last_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(instance_url, username)
);

CREATE TABLE IF NOT EXISTS tracked_repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_url TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  last_checked_at TEXT,
  last_commit_sha TEXT,
  last_issue_number INTEGER,
  last_pr_number INTEGER,
  last_release_tag TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(instance_url, owner, name)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT,
  target_type TEXT NOT NULL CHECK(target_type IN ('repository', 'user')),
  target_id INTEGER NOT NULL,
  commits_enabled INTEGER NOT NULL DEFAULT 1,
  issues_enabled INTEGER NOT NULL DEFAULT 1,
  prs_enabled INTEGER NOT NULL DEFAULT 1,
  releases_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, channel_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  instance_url TEXT NOT NULL,
  repository TEXT,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  instance_url TEXT NOT NULL,
  repository TEXT,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_processed_events_provider ON processed_events(provider, instance_url);
CREATE INDEX IF NOT EXISTS idx_subscriptions_target ON subscriptions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_guild ON subscriptions(guild_id);
`;

export function runMigrations(db: DatabaseAdapter, migrationsDir?: string): void {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = db.query<{ version: number }>("SELECT version FROM schema_migrations");
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const resolvedDir = migrationsDir || path.resolve(__dirname, "../../migrations");

  if (fs.existsSync(resolvedDir)) {
    const files = fs
      .readdirSync(resolvedDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)/);
      if (!match) continue;

      const version = parseInt(match[1], 10);
      if (appliedSet.has(version)) continue;

      const sqlPath = path.join(resolvedDir, file);
      const sqlContent = fs.readFileSync(sqlPath, "utf-8");

      db.transaction(() => {
        db.exec(sqlContent);
        db.run("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
      });

      logger.info(`Applied database migration: ${file} (v${version})`);
      appliedSet.add(version);
    }
  }

  // If no migrations were applied from file, ensure initial migration was run
  if (!appliedSet.has(1)) {
    db.transaction(() => {
      db.exec(FALLBACK_MIGRATION_001);
      db.run("INSERT INTO schema_migrations (version) VALUES (1)");
    });
    logger.info("Applied initial schema fallback migration (v1)");
  }
}
