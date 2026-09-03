import { DatabaseAdapter } from "./adapter";

export interface GuildRecord {
  id: string;
  name: string;
  joined_at: string;
  has_onboarded: number;
  created_at: string;
}

export interface GuildSettingsRecord {
  guild_id: string;
  notification_channel_id: string | null;
  poll_interval_seconds: number;
  commits_enabled: number;
  issues_enabled: number;
  prs_enabled: number;
  repos_enabled: number;
  releases_enabled: number;
  updated_at: string;
}

export interface GitInstanceRecord {
  id: number;
  name: string;
  base_url: string;
  provider_type: string;
  is_custom: number;
  created_at: string;
}

export interface TrackedUserRecord {
  id: number;
  instance_url: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_checked_at: string | null;
  last_event_id: string | null;
  created_at: string;
}

export interface TrackedRepoRecord {
  id: number;
  instance_url: string;
  owner: string;
  name: string;
  default_branch: string;
  last_checked_at: string | null;
  last_commit_sha: string | null;
  last_issue_number: number | null;
  last_pr_number: number | null;
  last_release_tag: string | null;
  created_at: string;
}

export interface SubscriptionRecord {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string | null;
  target_type: "repository" | "user";
  target_id: number;
  commits_enabled: number;
  issues_enabled: number;
  prs_enabled: number;
  releases_enabled: number;
  created_at: string;
}

export interface ProcessedEventRecord {
  event_key: string;
  provider: string;
  instance_url: string;
  repository: string | null;
  event_type: string;
  event_id: string;
  processed_at: string;
}

export class DatabaseRepository {
  constructor(private db: DatabaseAdapter) {}

  // ------------------- Guilds & Settings -------------------

  upsertGuild(id: string, name: string): GuildRecord {
    this.db.run(
      `INSERT INTO guilds (id, name, joined_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      [id, name]
    );

    // Ensure settings exist
    this.db.run(
      `INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)`,
      [id]
    );

    return this.getGuild(id)!;
  }

  getGuild(id: string): GuildRecord | undefined {
    return this.db.get<GuildRecord>("SELECT * FROM guilds WHERE id = ?", [id]);
  }

  markGuildOnboarded(id: string): void {
    this.db.run("UPDATE guilds SET has_onboarded = 1 WHERE id = ?", [id]);
  }

  getGuildSettings(guildId: string): GuildSettingsRecord | undefined {
    return this.db.get<GuildSettingsRecord>(
      "SELECT * FROM guild_settings WHERE guild_id = ?",
      [guildId]
    );
  }

  updateGuildSettings(
    guildId: string,
    settings: Partial<Omit<GuildSettingsRecord, "guild_id" | "updated_at">>
  ): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(settings)) {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) return;

    fields.push("updated_at = datetime('now')");
    values.push(guildId);

    this.db.run(
      `UPDATE guild_settings SET ${fields.join(", ")} WHERE guild_id = ?`,
      values
    );
  }

  // ------------------- Git Instances -------------------

  addInstance(name: string, baseUrl: string, providerType: string, isCustom = 0): GitInstanceRecord {
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
    this.db.run(
      `INSERT INTO git_instances (name, base_url, provider_type, is_custom)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(base_url) DO UPDATE SET name = excluded.name, provider_type = excluded.provider_type`,
      [name, normalizedUrl, providerType, isCustom]
    );
    return this.getInstanceByUrl(normalizedUrl)!;
  }

  getInstanceByUrl(baseUrl: string): GitInstanceRecord | undefined {
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
    return this.db.get<GitInstanceRecord>(
      "SELECT * FROM git_instances WHERE base_url = ?",
      [normalizedUrl]
    );
  }

  getAllInstances(): GitInstanceRecord[] {
    return this.db.query<GitInstanceRecord>(
      "SELECT * FROM git_instances ORDER BY id ASC"
    );
  }

  // ------------------- Tracked Users -------------------

  addTrackedUser(instanceUrl: string, username: string, displayName?: string, avatarUrl?: string): TrackedUserRecord {
    const normUrl = instanceUrl.trim().replace(/\/+$/, "");
    const normUser = username.trim();
    this.db.run(
      `INSERT INTO tracked_users (instance_url, username, display_name, avatar_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(instance_url, username) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, tracked_users.display_name),
         avatar_url = COALESCE(excluded.avatar_url, tracked_users.avatar_url)`,
      [normUrl, normUser, displayName || null, avatarUrl || null]
    );
    return this.getTrackedUser(normUrl, normUser)!;
  }

  getTrackedUser(instanceUrl: string, username: string): TrackedUserRecord | undefined {
    const normUrl = instanceUrl.trim().replace(/\/+$/, "");
    return this.db.get<TrackedUserRecord>(
      "SELECT * FROM tracked_users WHERE instance_url = ? AND LOWER(username) = LOWER(?)",
      [normUrl, username.trim()]
    );
  }

  getTrackedUserById(id: number): TrackedUserRecord | undefined {
    return this.db.get<TrackedUserRecord>("SELECT * FROM tracked_users WHERE id = ?", [id]);
  }

  getAllTrackedUsers(): TrackedUserRecord[] {
    return this.db.query<TrackedUserRecord>("SELECT * FROM tracked_users ORDER BY id ASC");
  }

  updateTrackedUserCheck(id: number, lastEventId?: string, avatarUrl?: string): void {
    const updates = ["last_checked_at = datetime('now')"];
    const params: unknown[] = [];
    if (lastEventId !== undefined) {
      updates.push("last_event_id = ?");
      params.push(lastEventId);
    }
    if (avatarUrl) {
      updates.push("avatar_url = ?");
      params.push(avatarUrl);
    }
    params.push(id);
    this.db.run(`UPDATE tracked_users SET ${updates.join(", ")} WHERE id = ?`, params);
  }

  // ------------------- Tracked Repositories -------------------

  addTrackedRepo(
    instanceUrl: string,
    owner: string,
    name: string,
    defaultBranch = "main"
  ): TrackedRepoRecord {
    const normUrl = instanceUrl.trim().replace(/\/+$/, "");
    const normOwner = owner.trim();
    const normName = name.trim();
    this.db.run(
      `INSERT INTO tracked_repositories (instance_url, owner, name, default_branch)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(instance_url, owner, name) DO UPDATE SET
         default_branch = COALESCE(excluded.default_branch, tracked_repositories.default_branch)`,
      [normUrl, normOwner, normName, defaultBranch]
    );
    return this.getTrackedRepo(normUrl, normOwner, normName)!;
  }

  getTrackedRepo(instanceUrl: string, owner: string, name: string): TrackedRepoRecord | undefined {
    const normUrl = instanceUrl.trim().replace(/\/+$/, "");
    return this.db.get<TrackedRepoRecord>(
      "SELECT * FROM tracked_repositories WHERE instance_url = ? AND LOWER(owner) = LOWER(?) AND LOWER(name) = LOWER(?)",
      [normUrl, owner.trim(), name.trim()]
    );
  }

  getTrackedRepoById(id: number): TrackedRepoRecord | undefined {
    return this.db.get<TrackedRepoRecord>("SELECT * FROM tracked_repositories WHERE id = ?", [id]);
  }

  getAllTrackedRepos(): TrackedRepoRecord[] {
    return this.db.query<TrackedRepoRecord>("SELECT * FROM tracked_repositories ORDER BY id ASC");
  }

  updateTrackedRepoCheck(
    id: number,
    data: {
      lastCommitSha?: string;
      lastIssueNumber?: number;
      lastPrNumber?: number;
      lastReleaseTag?: string;
    }
  ): void {
    const updates = ["last_checked_at = datetime('now')"];
    const params: unknown[] = [];

    if (data.lastCommitSha !== undefined) {
      updates.push("last_commit_sha = ?");
      params.push(data.lastCommitSha);
    }
    if (data.lastIssueNumber !== undefined) {
      updates.push("last_issue_number = ?");
      params.push(data.lastIssueNumber);
    }
    if (data.lastPrNumber !== undefined) {
      updates.push("last_pr_number = ?");
      params.push(data.lastPrNumber);
    }
    if (data.lastReleaseTag !== undefined) {
      updates.push("last_release_tag = ?");
      params.push(data.lastReleaseTag);
    }

    params.push(id);
    this.db.run(`UPDATE tracked_repositories SET ${updates.join(", ")} WHERE id = ?`, params);
  }

  // ------------------- Subscriptions -------------------

  addSubscription(sub: {
    guildId: string;
    channelId: string;
    userId?: string;
    targetType: "repository" | "user";
    targetId: number;
    commitsEnabled?: boolean;
    issuesEnabled?: boolean;
    prsEnabled?: boolean;
    releasesEnabled?: boolean;
  }): SubscriptionRecord {
    this.db.run(
      `INSERT INTO subscriptions (guild_id, channel_id, user_id, target_type, target_id, commits_enabled, issues_enabled, prs_enabled, releases_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, channel_id, target_type, target_id) DO UPDATE SET
         commits_enabled = excluded.commits_enabled,
         issues_enabled = excluded.issues_enabled,
         prs_enabled = excluded.prs_enabled,
         releases_enabled = excluded.releases_enabled`,
      [
        sub.guildId,
        sub.channelId,
        sub.userId || null,
        sub.targetType,
        sub.targetId,
        sub.commitsEnabled !== false ? 1 : 0,
        sub.issuesEnabled !== false ? 1 : 0,
        sub.prsEnabled !== false ? 1 : 0,
        sub.releasesEnabled !== false ? 1 : 0,
      ]
    );

    return this.db.get<SubscriptionRecord>(
      `SELECT * FROM subscriptions WHERE guild_id = ? AND channel_id = ? AND target_type = ? AND target_id = ?`,
      [sub.guildId, sub.channelId, sub.targetType, sub.targetId]
    )!;
  }

  removeSubscription(guildId: string, channelId: string, targetType: "repository" | "user", targetId: number): boolean {
    const result = this.db.run(
      `DELETE FROM subscriptions WHERE guild_id = ? AND channel_id = ? AND target_type = ? AND target_id = ?`,
      [guildId, channelId, targetType, targetId]
    );
    return result.changes > 0;
  }

  removeSubscriptionsByTarget(targetType: "repository" | "user", targetId: number): number {
    const result = this.db.run(
      `DELETE FROM subscriptions WHERE target_type = ? AND target_id = ?`,
      [targetType, targetId]
    );
    return result.changes;
  }

  getSubscriptionsForTarget(targetType: "repository" | "user", targetId: number): SubscriptionRecord[] {
    return this.db.query<SubscriptionRecord>(
      `SELECT s.* FROM subscriptions s
       LEFT JOIN guild_settings gs ON gs.guild_id = s.guild_id
       WHERE s.target_type = ? AND s.target_id = ?`,
      [targetType, targetId]
    );
  }

  getGuildSubscriptions(guildId: string): Array<
    SubscriptionRecord & {
      repo_owner?: string;
      repo_name?: string;
      username?: string;
      instance_url: string;
    }
  > {
    return this.db.query(
      `SELECT s.*,
              tr.owner AS repo_owner, tr.name AS repo_name,
              tu.username AS username,
              COALESCE(tr.instance_url, tu.instance_url) AS instance_url
       FROM subscriptions s
       LEFT JOIN tracked_repositories tr ON s.target_type = 'repository' AND s.target_id = tr.id
       LEFT JOIN tracked_users tu ON s.target_type = 'user' AND s.target_id = tu.id
       WHERE s.guild_id = ?
       ORDER BY s.id DESC`,
      [guildId]
    );
  }

  // ------------------- Events & Deduplication -------------------

  isEventProcessed(eventKey: string): boolean {
    const row = this.db.get<{ event_key: string }>(
      "SELECT event_key FROM processed_events WHERE event_key = ?",
      [eventKey]
    );
    return row !== undefined;
  }

  markEventProcessed(
    eventKey: string,
    provider: string,
    instanceUrl: string,
    eventType: string,
    eventId: string,
    repository: string | null = null,
    payload?: string
  ): void {
    this.db.run(
      `INSERT OR IGNORE INTO processed_events (event_key, provider, instance_url, repository, event_type, event_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventKey, provider, instanceUrl, repository, eventType, eventId]
    );

    if (payload) {
      this.db.run(
        `INSERT OR IGNORE INTO events (event_key, provider, instance_url, repository, event_type, event_id, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [eventKey, provider, instanceUrl, repository, eventType, eventId, payload]
      );
    }
  }

  // ------------------- Statistics -------------------

  getStats(): {
    guildsCount: number;
    trackedUsersCount: number;
    trackedReposCount: number;
    subscriptionsCount: number;
    processedEventsCount: number;
  } {
    const guilds = this.db.get<{ count: number }>("SELECT COUNT(*) as count FROM guilds")?.count || 0;
    const users = this.db.get<{ count: number }>("SELECT COUNT(*) as count FROM tracked_users")?.count || 0;
    const repos = this.db.get<{ count: number }>("SELECT COUNT(*) as count FROM tracked_repositories")?.count || 0;
    const subs = this.db.get<{ count: number }>("SELECT COUNT(*) as count FROM subscriptions")?.count || 0;
    const events = this.db.get<{ count: number }>("SELECT COUNT(*) as count FROM processed_events")?.count || 0;

    return {
      guildsCount: guilds,
      trackedUsersCount: users,
      trackedReposCount: repos,
      subscriptionsCount: subs,
      processedEventsCount: events,
    };
  }
}
