/**
 * Sanitizes external text to prevent Discord mentions (@everyone, @here, user/role pings)
 * and truncates to safe lengths.
 */
export function sanitizeText(input?: string | null, maxLength = 1024): string {
  if (!input) return "";

  const clean = input
    // Defang @everyone and @here
    .replace(/@everyone/gi, "@\u200beveryone")
    .replace(/@here/gi, "@\u200bhere")
    // Defang user/role/channel mentions
    .replace(/<@!?(\d+)>/g, "<@\u200b$1>")
    .replace(/<@&(\d+)>/g, "<@&\u200b$1>")
    // Trim
    .trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 3)}...`;
}

/**
 * Formats a number with comma separators (e.g. 1920 -> "1,920")
 */
export function formatNumber(num?: number | null): string {
  if (num === null || num === undefined || !Number.isFinite(num)) {
    return "0";
  }
  return num.toLocaleString("en-US");
}
