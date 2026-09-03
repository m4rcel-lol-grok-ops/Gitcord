import { describe, it, expect, beforeEach, vi } from "vitest";
import { SqliteAdapter } from "../../src/database/adapter";
import { runMigrations } from "../../src/database/migrator";
import { DatabaseRepository } from "../../src/database/repository";
import { TrackingService } from "../../src/git/tracker/TrackingService";
import { ProviderRegistry } from "../../src/git/providers";
import { GitProvider } from "../../src/git/providers/GitProvider";
import { NormalizedGitEvent } from "../../src/git/models";

class MockProvider extends GitProvider {
  readonly name = "Mock";
  readonly type = "mock";
  readonly iconUrl = "https://mock.icon";
  readonly color = 0x123456;

  detectInstance = vi.fn().mockResolvedValue(true);
  getUser = vi.fn().mockResolvedValue(null);
  getRepository = vi.fn().mockResolvedValue(null);
  getRecentCommits = vi.fn();
  getCommitDetails = vi.fn();
  getRecentIssues = vi.fn().mockResolvedValue([]);
  getRecentPullRequests = vi.fn().mockResolvedValue([]);
  getBranches = vi.fn().mockResolvedValue([]);
  getRecentReleases = vi.fn().mockResolvedValue([]);
  getUserRecentActivity = vi.fn().mockResolvedValue([]);
  getRepoRecentActivity = vi.fn().mockResolvedValue([]);
}

describe("TrackingService", () => {
  let adapter: SqliteAdapter;
  let repo: DatabaseRepository;
  let mockProvider: MockProvider;
  let registry: ProviderRegistry;
  let tracker: TrackingService;

  beforeEach(() => {
    adapter = new SqliteAdapter(":memory:");
    runMigrations(adapter);
    repo = new DatabaseRepository(adapter);
    mockProvider = new MockProvider();
    registry = new ProviderRegistry();
    registry.registerProvider(mockProvider);
    tracker = new TrackingService(repo, registry, 60);
  });

  it("should seed initial events without dispatching notifications", async () => {
    repo.upsertGuild("g1", "Test Guild");
    const trackedRepo = repo.addTrackedRepo("https://mock.git.com", "owner", "repo");
    repo.addSubscription({
      guildId: "g1",
      channelId: "c1",
      targetType: "repository",
      targetId: trackedRepo.id,
    });

    mockProvider.getRecentCommits.mockResolvedValue([
      { id: "c1", shortId: "c1", message: "first", author: "alice", date: "2026-09-01", url: "url1" },
    ]);
    mockProvider.getCommitDetails.mockResolvedValue({
      statistics: { filesChanged: 1, linesAdded: 10, linesRemoved: 2 },
      message: "first",
      author: { username: "alice" },
      date: "2026-09-01",
      url: "url1",
    });

    const received: NormalizedGitEvent[] = [];
    tracker.onNotification((event) => {
      received.push(event);
    });

    // First poll (initial check)
    await tracker.poll();

    // Initial check should NOT dispatch notifications to prevent spam
    expect(received.length).toBe(0);
    // Event must now be stored in database
    expect(repo.isEventProcessed("mock:https://mock.git.com:owner/repo:commit:c1")).toBe(true);
    // Second poll with a new commit
    mockProvider.getRecentCommits.mockResolvedValue([
      { id: "c2", shortId: "c2", message: "second", author: "alice", date: "2026-09-02", url: "url2" },
      { id: "c1", shortId: "c1", message: "first", author: "alice", date: "2026-09-01", url: "url1" },
    ]);
    mockProvider.getCommitDetails.mockResolvedValue({
      statistics: { filesChanged: 2, linesAdded: 25, linesRemoved: 5 },
      message: "second",
      author: { username: "alice" },
      date: "2026-09-02",
      url: "url2",
    });

    await tracker.poll();

    // Only c2 should be dispatched
    expect(received.length).toBe(1);
    expect((received[0] as any).commit.id).toBe("c2");

    // Third poll with same commits should dispatch nothing (deduplication)
    await tracker.poll();
    expect(received.length).toBe(1);
  });
});
