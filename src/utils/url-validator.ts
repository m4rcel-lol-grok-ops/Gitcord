import { URL } from "url";
import net from "net";

export interface ParsedRepoUrl {
  instanceUrl: string;
  owner: string;
  name: string;
  defaultBranch?: string;
  providerHint?: string;
}

// IP ranges for SSRF protection
function isPrivateIp(ip: string): boolean {
  if (ip === "localhost" || ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") {
    return true;
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    // 10.0.0.0 - 10.255.255.255
    if (parts[0] === 10) return true;
    // 172.16.0.0 - 172.31.255.255
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0 - 192.168.255.255
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0 - 169.254.255.255 (link-local, cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Unique local address fc00::/7
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // Link local address fe80::/10
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true;
    }
  }

  return false;
}

/**
 * Validates a Git instance URL to prevent SSRF and protocol manipulation
 */
export function validateGitInstanceUrl(urlString: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const raw = urlString.trim();
    if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
      return { valid: false, error: "URL must use http or https protocol" };
    }

    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Only HTTP and HTTPS protocols are supported" };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname === "localhost" || isPrivateIp(hostname)) {
      return { valid: false, error: "Target host is not permitted (SSRF protection)" };
    }

    // Standardize: no trailing slash, no search params or hashes
    const normalized = `${parsed.protocol}//${parsed.host}`;
    return { valid: true, normalized };
  } catch {
    return { valid: false, error: "Malformed URL" };
  }
}

/**
 * Parses user input for repository: could be full URL or owner/repo shorthand
 */
export function parseRepositoryInput(input: string, defaultInstance = "https://github.com"): ParsedRepoUrl | null {
  const trimmed = input.trim().replace(/\.git$/i, "");

  // If input looks like full URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const validation = validateGitInstanceUrl(`${parsed.protocol}//${parsed.host}`);
      if (!validation.valid || !validation.normalized) {
        return null;
      }

      // Path segments
      const segments = parsed.pathname
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);

      if (segments.length < 2) {
        return null;
      }

      const instanceUrl = validation.normalized;
      const name = segments[segments.length - 1];
      const owner = segments.slice(0, segments.length - 1).join("/");

      let providerHint: string | undefined;
      if (parsed.hostname.includes("github.com")) providerHint = "github";
      else if (parsed.hostname.includes("gitlab.com")) providerHint = "gitlab";
      else if (parsed.hostname.includes("codeberg.org")) providerHint = "forgejo";

      return {
        instanceUrl,
        owner,
        name,
        providerHint,
      };
    } catch {
      return null;
    }
  }

  // Shorthand: owner/repo
  const parts = trimmed.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const name = parts[parts.length - 1];
    const owner = parts.slice(0, parts.length - 1).join("/");
    return {
      instanceUrl: defaultInstance,
      owner,
      name,
      providerHint: defaultInstance.includes("github.com") ? "github" : undefined,
    };
  }

  return null;
}
