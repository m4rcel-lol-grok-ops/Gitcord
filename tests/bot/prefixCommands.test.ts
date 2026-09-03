import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrefixCommandHandler } from "../../src/bot/commands/prefixHandler";
import { CommandHandlers } from "../../src/bot/commands/handlers";
import { SqliteAdapter } from "../../src/database/adapter";
import { runMigrations } from "../../src/database/migrator";
import { DatabaseRepository } from "../../src/database/repository";
import { TrackingService } from "../../src/git/tracker/TrackingService";

describe("Prefix Command Handling", () => {
  let handlers: CommandHandlers;
  let prefixHandler: PrefixCommandHandler;

  beforeEach(() => {
    const adapter = new SqliteAdapter(":memory:");
    runMigrations(adapter);
    const repo = new DatabaseRepository(adapter);
    const tracker = new TrackingService(repo, undefined, 60);
    handlers = new CommandHandlers(repo, tracker, undefined, "git");
    prefixHandler = new PrefixCommandHandler(handlers, "git");
  });

  it("should ignore normal messages and bot messages", async () => {
    const spyHelp = vi.spyOn(handlers, "handleHelp").mockResolvedValue();

    // Normal message not starting with prefix
    await prefixHandler.handleMessage({
      content: "Hello world!",
      author: { bot: false },
    } as any);
    expect(spyHelp).not.toHaveBeenCalled();

    // Message starting with word 'github' (not prefix 'git')
    await prefixHandler.handleMessage({
      content: "github is down today",
      author: { bot: false },
    } as any);
    expect(spyHelp).not.toHaveBeenCalled();

    // Bot message
    await prefixHandler.handleMessage({
      content: "git help",
      author: { bot: true },
    } as any);
    expect(spyHelp).not.toHaveBeenCalled();
  });

  it("should recognize 'git help' and 'git' commands", async () => {
    const spyHelp = vi.spyOn(handlers, "handleHelp").mockResolvedValue();

    await prefixHandler.handleMessage({
      content: "git help",
      author: { bot: false },
      guildId: "g1",
      channelId: "c1",
      reply: vi.fn(),
    } as any);
    expect(spyHelp).toHaveBeenCalledTimes(1);

    await prefixHandler.handleMessage({
      content: "git",
      author: { bot: false },
      guildId: "g1",
      channelId: "c1",
      reply: vi.fn(),
    } as any);
    expect(spyHelp).toHaveBeenCalledTimes(2);
  });

  it("should dispatch 'git follow' with arguments", async () => {
    const spyFollow = vi.spyOn(handlers, "handleFollow").mockResolvedValue();

    await prefixHandler.handleMessage({
      content: "git follow m5rcel/Gitcord repository",
      author: { bot: false },
      guildId: "g1",
      channelId: "c1",
      reply: vi.fn(),
    } as any);

    expect(spyFollow).toHaveBeenCalledWith(
      expect.anything(),
      "m5rcel/Gitcord",
      "repository",
      undefined
    );
  });
});
