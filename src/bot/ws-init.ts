// Source - https://stackoverflow.com/a/77072376
// Posted by Alexandre888
// Retrieved 2026-09-03, License - CC BY-SA 4.0
import { DefaultWebSocketManagerOptions } from "@discordjs/ws";

/**
 * Initializes the Discord WebSocket manager options.
 * Modifies identifyProperties.browser to report as 'Discord Android' before
 * the WebSocket connection is established.
 */
export function initDiscordWebSocket(browserName = "Discord Android"): string {
  // DefaultWebSocketManagerOptions.identifyProperties has readonly typings in @discordjs/ws, but is mutated during bot setup
  type MutableIdentify = { browser: string };
  const mutableProps = DefaultWebSocketManagerOptions.identifyProperties as unknown as MutableIdentify;
  mutableProps.browser = browserName;
  return DefaultWebSocketManagerOptions.identifyProperties.browser;
}

// Automatically execute upon module import to guarantee initialization before any client login
initDiscordWebSocket();
