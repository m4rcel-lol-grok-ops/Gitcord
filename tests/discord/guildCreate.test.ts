import { describe, it, expect, beforeEach, vi } from "vitest";
import { SqliteAdapter } from "../../src/database/adapter";
import { runMigrations } from "../../src/database/migrator";
import { DatabaseRepository } from "../../src/database/repository";
import { handleGuildCreate } from "../../src/bot/events/guildCreate";
import { ChannelType, PermissionFlagsBits } from "discord.js";

describe("Guild Onboarding Event", () => {
  let adapter: SqliteAdapter;
  let repo: DatabaseRepository;

  beforeEach(() => {
    adapter = new SqliteAdapter(":memory:");
    runMigrations(adapter);
    repo = new DatabaseRepository(adapter);
  });

  it("should send onboarding message on first invite and mark onboarded", async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const mockChannel = {
      type: ChannelType.GuildText,
      name: "general",
      send: mockSend,
      permissionsFor: vi.fn().mockReturnValue({
        has: (flag: bigint) =>
          flag === PermissionFlagsBits.SendMessages || flag === PermissionFlagsBits.EmbedLinks,
      }),
    };

    const mockGuild: any = {
      id: "guild-100",
      name: "Acme Corp",
      systemChannel: mockChannel,
      members: {
        me: { id: "bot-1" },
      },
      channels: {
        cache: new Map([["ch-1", mockChannel]]),
      },
    };

    await handleGuildCreate(mockGuild, repo, "git");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const guildRec = repo.getGuild("guild-100");
    expect(guildRec?.has_onboarded).toBe(1);

    // Second invocation should skip sending
    await handleGuildCreate(mockGuild, repo, "git");
    expect(mockSend).toHaveBeenCalledTimes(1); // Still 1!
  });
});
