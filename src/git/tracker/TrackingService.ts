import { DatabaseRepository } from "../../database/repository";
import { ProviderRegistry, providerRegistry } from "../providers";
import { NormalizedGitEvent } from "../models";
import { logger } from "../../utils/logger";
import { SubscriptionRecord } from "../../database/repository";

export type EventNotificationHandler = (
  event: NormalizedGitEvent,
  subscriptions: SubscriptionRecord[]
) => Promise<void> | void;

export interface TrackingServiceStats {
  isRunning: boolean;
  lastPollCycleAt: Date | null;
  lastPollDurationMs: number;
  totalEventsProcessed: number;
  pollIntervalSeconds: number;
  trackedReposCount: number;
  trackedUsersCount: number;
}

export class TrackingService {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private notificationHandlers: EventNotificationHandler[] = [];
  private lastPollCycleAt: Date | null = null;
  private lastPollDurationMs = 0;
  private totalEventsProcessed = 0;

  constructor(
    private repository: DatabaseRepository,
    private registry: ProviderRegistry = providerRegistry,
    private pollIntervalSeconds = 60
  ) {}

  onNotification(handler: EventNotificationHandler): void {
    this.notificationHandlers.push(handler);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Starting Gitcord Tracking Service (interval: ${this.pollIntervalSeconds}s)`);

    // Run first cycle shortly after start
    setTimeout(() => this.poll(), 2000);

    this.timer = setInterval(() => {
      this.poll().catch((err) => logger.error("Unhandled error during tracking poll cycle", err));
    }, this.pollIntervalSeconds * 1000);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("Gitcord Tracking Service stopped");
  }

  async poll(): Promise<void> {
    const startTime = Date.now();
    logger.debug("Starting tracking polling cycle");

    try {
      await this.pollRepositories();
      await this.pollUsers();
    } catch (err) {
      logger.error("Error occurred during tracking poll cycle", err);
    } finally {
      this.lastPollCycleAt = new Date();
      this.lastPollDurationMs = Date.now() - startTime;
      logger.debug(`Tracking poll cycle finished in ${this.lastPollDurationMs}ms`);
    }
  }

  private async pollRepositories(): Promise<void> {
    const repos = this.repository.getAllTrackedRepos();

    for (const repo of repos) {
      try {
        const provider = await this.registry.resolveProviderForUrl(repo.instance_url);
        const subscriptions = this.repository.getSubscriptionsForTarget("repository", repo.id);

        if (subscriptions.length === 0) {
          continue; // No active subscribers, skip polling to conserve rate limits
        }

        const isInitialCheck = repo.last_checked_at === null;

        // Fetch recent activity / commits
        const [commits, issues, prs, releases] = await Promise.all([
          provider.getRecentCommits(repo.instance_url, repo.owner, repo.name, { limit: 5 }),
          provider.getRecentIssues(repo.instance_url, repo.owner, repo.name, { limit: 5 }),
          provider.getRecentPullRequests(repo.instance_url, repo.owner, repo.name, { limit: 5 }),
          provider.getRecentReleases(repo.instance_url, repo.owner, repo.name),
        ]);

        // Process commits
        for (const c of commits) {
          const eventKey = `${provider.type}:${repo.instance_url}:${repo.owner}/${repo.name}:commit:${c.id}`;
          if (this.repository.isEventProcessed(eventKey)) continue;

          // Fetch full commit details including diff statistics
          const details = await provider.getCommitDetails(repo.instance_url, repo.owner, repo.name, c.id);

          const event: NormalizedGitEvent = {
            type: "commit",
            provider: provider.type,
            instance: repo.instance_url,
            repository: {
              name: repo.name,
              owner: repo.owner,
              url: `${repo.instance_url}/${repo.owner}/${repo.name}`,
            },
            author: {
              username: details?.author.username || c.author,
              displayName: details?.author.displayName,
              avatarUrl: details?.author.avatarUrl || c.avatarUrl,
            },
            commit: {
              id: c.id,
              shortId: c.shortId,
              message: details?.message || c.message,
              url: c.url,
              date: details?.date || c.date,
            },
            statistics: details?.statistics || {
              filesChanged: 1,
              isUnavailable: true,
            },
          };

          this.repository.markEventProcessed(
            eventKey,
            provider.type,
            repo.instance_url,
            "commit",
            c.id,
            `${repo.owner}/${repo.name}`,
            JSON.stringify(event)
          );

          // Only notify subscribers if this is not the initial baseline seeding
          if (!isInitialCheck) {
            const commitSubs = subscriptions.filter((s) => s.commits_enabled === 1);
            if (commitSubs.length > 0) {
              await this.dispatchNotification(event, commitSubs);
            }
          }
          this.totalEventsProcessed++;
        }

        // Process issues
        for (const iss of issues) {
          const eventKey = `${provider.type}:${repo.instance_url}:${repo.owner}/${repo.name}:issue:${iss.issue.number}:${iss.action}`;
          if (this.repository.isEventProcessed(eventKey)) continue;

          this.repository.markEventProcessed(
            eventKey,
            provider.type,
            repo.instance_url,
            "issue",
            `${iss.issue.number}:${iss.action}`,
            `${repo.owner}/${repo.name}`,
            JSON.stringify(iss)
          );

          if (!isInitialCheck) {
            const issueSubs = subscriptions.filter((s) => s.issues_enabled === 1);
            if (issueSubs.length > 0) {
              await this.dispatchNotification(iss, issueSubs);
            }
          }
          this.totalEventsProcessed++;
        }

        // Process PRs
        for (const pr of prs) {
          const eventKey = `${provider.type}:${repo.instance_url}:${repo.owner}/${repo.name}:pr:${pr.pullRequest.number}:${pr.action}`;
          if (this.repository.isEventProcessed(eventKey)) continue;

          this.repository.markEventProcessed(
            eventKey,
            provider.type,
            repo.instance_url,
            "pull_request",
            `${pr.pullRequest.number}:${pr.action}`,
            `${repo.owner}/${repo.name}`,
            JSON.stringify(pr)
          );

          if (!isInitialCheck) {
            const prSubs = subscriptions.filter((s) => s.prs_enabled === 1);
            if (prSubs.length > 0) {
              await this.dispatchNotification(pr, prSubs);
            }
          }
          this.totalEventsProcessed++;
        }

        // Process releases
        for (const rel of releases) {
          const eventKey = `${provider.type}:${repo.instance_url}:${repo.owner}/${repo.name}:release:${rel.release.tagName}`;
          if (this.repository.isEventProcessed(eventKey)) continue;

          this.repository.markEventProcessed(
            eventKey,
            provider.type,
            repo.instance_url,
            "release",
            rel.release.tagName,
            `${repo.owner}/${repo.name}`,
            JSON.stringify(rel)
          );

          if (!isInitialCheck) {
            const relSubs = subscriptions.filter((s) => s.releases_enabled === 1);
            if (relSubs.length > 0) {
              await this.dispatchNotification(rel, relSubs);
            }
          }
          this.totalEventsProcessed++;
        }

        // Update repository last checked
        this.repository.updateTrackedRepoCheck(repo.id, {
          lastCommitSha: commits[0]?.id,
          lastIssueNumber: issues[0]?.issue.number,
          lastPrNumber: prs[0]?.pullRequest.number,
          lastReleaseTag: releases[0]?.release.tagName,
        });
      } catch (err) {
        logger.error(`Error polling repository ${repo.owner}/${repo.name}`, err);
      }
    }
  }

  private async pollUsers(): Promise<void> {
    const users = this.repository.getAllTrackedUsers();

    for (const user of users) {
      try {
        const provider = await this.registry.resolveProviderForUrl(user.instance_url);
        const subscriptions = this.repository.getSubscriptionsForTarget("user", user.id);

        if (subscriptions.length === 0) {
          continue;
        }

        const isInitialCheck = user.last_checked_at === null;
        const activities = await provider.getUserRecentActivity(user.instance_url, user.username);

        for (const act of activities) {
          let eventId = "";
          if (act.type === "commit") eventId = act.commit.id;
          else if (act.type === "issue") eventId = `${act.issue.number}:${act.action}`;
          else if (act.type === "pull_request") eventId = `${act.pullRequest.number}:${act.action}`;
          else if (act.type === "release") eventId = act.release.tagName;
          else continue;

          const eventKey = `${provider.type}:${user.instance_url}:user:${user.username}:${act.type}:${eventId}`;
          if (this.repository.isEventProcessed(eventKey)) continue;

          this.repository.markEventProcessed(
            eventKey,
            provider.type,
            user.instance_url,
            act.type,
            eventId,
            act.repository.name,
            JSON.stringify(act)
          );

          if (!isInitialCheck) {
            await this.dispatchNotification(act, subscriptions);
          }
          this.totalEventsProcessed++;
        }

        this.repository.updateTrackedUserCheck(user.id);
      } catch (err) {
        logger.error(`Error polling user ${user.username}`, err);
      }
    }
  }

  private async dispatchNotification(event: NormalizedGitEvent, subscriptions: SubscriptionRecord[]): Promise<void> {
    for (const handler of this.notificationHandlers) {
      try {
        await handler(event, subscriptions);
      } catch (err) {
        logger.error("Notification handler error", err);
      }
    }
  }

  getStats(): TrackingServiceStats {
    const dbStats = this.repository.getStats();
    return {
      isRunning: this.isRunning,
      lastPollCycleAt: this.lastPollCycleAt,
      lastPollDurationMs: this.lastPollDurationMs,
      totalEventsProcessed: this.totalEventsProcessed,
      pollIntervalSeconds: this.pollIntervalSeconds,
      trackedReposCount: dbStats.trackedReposCount,
      trackedUsersCount: dbStats.trackedUsersCount,
    };
  }
}
