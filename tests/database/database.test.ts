import { describe, it, expect, beforeEach } from "vitest";
import { SqliteAdapter } from "../../src/database/adapter";
import { runMigrations } from "../../src/database/migrator";
import { DatabaseRepository } from "../../src/database/repository";

describe("Database Layer & Repository", () => {
  let adapter: SqliteAdapter;
  let repo: DatabaseRepository;

  beforeEach(() => {
    adapter = new SqliteAdapter(":memory:");
    runMigrations(adapter);
    repo = new DatabaseRepository(adapter);
  });

  it("should upsert guild and create default settings", () => {
    const guild = repo.upsertGuild("123456", "Test Guild");
    expect(guild.id).toBe("123456");
    expect(guild.name).toBe("Test Guild");
    expect(guild.has_onboarded).toBe(0);

    const settings = repo.getGuildSettings("123456");
    expect(settings).toBeDefined();
    expect(settings?.commits_enabled).toBe(1);

    repo.markGuildOnboarded("123456");
    const updated = repo.getGuild("123456");
    expect(updated?.has_onboarded).toBe(1);
  });

  it("should manage Git instances", () => {
    repo.addInstance("GitHub", "https://github.com", "github");
    repo.addInstance("Codeberg", "https://codeberg.org", "forgejo");

    const gh = repo.getInstanceByUrl("https://github.com");
    expect(gh).toBeDefined();
    expect(gh?.provider_type).toBe("github");

    const all = repo.getAllInstances();
    expect(all.length).toBe(2);
  });

  it("should track users and repositories", () => {
    const user = repo.addTrackedUser("https://github.com", "m5rcel", "Marcel", "https://avatar.url");
    expect(user.username).toBe("m5rcel");

    const repoItem = repo.addTrackedRepo("https://github.com", "m5rcel", "Gitcord", "main");
    expect(repoItem.owner).toBe("m5rcel");
    expect(repoItem.name).toBe("Gitcord");

    // Subscription
    const sub = repo.addSubscription({
      guildId: "g1",
      channelId: "c1",
      targetType: "repository",
      targetId: repoItem.id,
    });
    expect(sub.guild_id).toBe("g1");

    const subs = repo.getSubscriptionsForTarget("repository", repoItem.id);
    expect(subs.length).toBe(1);
  });

  it("should deduplicate events correctly", () => {
    const eventKey = "github:repo:m5rcel/Gitcord:commit:abc1234";
    expect(repo.isEventProcessed(eventKey)).toBe(false);

    repo.markEventProcessed(
      eventKey,
      "github",
      "https://github.com",
      "commit",
      "abc1234",
      "m5rcel/Gitcord",
      JSON.stringify({ id: "abc1234" })
    );

    expect(repo.isEventProcessed(eventKey)).toBe(true);
  });
});
