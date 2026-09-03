import { describe, it, expect } from "vitest";
import { DefaultWebSocketManagerOptions } from "@discordjs/ws";
import { initDiscordWebSocket } from "../../src/bot/ws-init";

describe("Discord WebSocket Initialization", () => {
  it("should configure identifyProperties.browser to 'Discord Android'", () => {
    // Re-run initialization function
    const result = initDiscordWebSocket();

    expect(result).toBe("Discord Android");
    expect(DefaultWebSocketManagerOptions.identifyProperties.browser).toBe("Discord Android");
  });
});
