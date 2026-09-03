# Gitcord — Production-Ready Git Integration Discord Bot

Gitcord is a production-ready Discord bot that integrates Git repositories and Git hosting instances directly into your Discord servers. Its primary purpose is to scrape, monitor, and display Git activity using beautiful, information-dense embeds.

> **IMPORTANT:** Gitcord is **strictly a read-only / scraper bot**. It never modifies repositories, creates commits, creates issues, merges pull requests, deletes repositories, edits files, or performs any other write or destructive operation. It does not contain AI features of any kind.

---

## Table of Contents

1. [What Gitcord Is](#1-what-gitcord-is)
2. [Features](#2-features)
3. [Supported Git Providers](#3-supported-git-providers)
4. [Requirements](#4-requirements)
5. [Docker Installation](#5-docker-installation)
6. [Environment Variables](#6-environment-variables)
7. [Discord Bot Creation](#7-discord-bot-creation)
8. [Required Intents](#8-required-intents)
9. [Command Deployment](#9-command-deployment)
10. [Inviting the Bot](#10-inviting-the-bot)
11. [Initial Server Setup](#11-initial-server-setup)
12. [Following a Git User](#12-following-a-git-user)
13. [Following a Repository](#13-following-a-repository)
14. [Configuring Notifications](#14-configuring-notifications)
15. [Provider Authentication](#15-provider-authentication)
16. [Troubleshooting](#16-troubleshooting)
17. [Rate Limits](#17-rate-limits)
18. [Security](#18-security)
19. [Discord WebSocket Initialization](#19-discord-websocket-initialization)
20. [Development](#20-development)
21. [Adding Another Git Provider](#21-adding-another-git-provider)

---

## 1. What Gitcord Is

Gitcord bridges your development workflows with your Discord community or development team. It tracks commits, pull requests, issues, and releases across multiple Git hosting instances (both cloud and self-hosted) and broadcasts clean, readable updates into designated Discord channels.

---

## 2. Features

- **Strictly Read-Only:** Zero write access, zero destructive capabilities.
- **Multi-Provider Support:** First-class support for GitHub, GitLab, Gitea, Forgejo, and generic Git instances.
- **Information-Dense Commit Embeds:** Displays commit author, message, changed file statistics (added, modified, removed), and git-diff style line statistics (`+ 1,920`, `- 500`).
- **Interactive Commit History:** Interactive paginated history with Discord buttons (`◀ Previous` / `Next ▶`).
- **User & Repository Subscriptions:** Monitor individual developer activity or entire repositories.
- **Dual Interface:** Both Slash Commands (`/git ...`) and Prefix Commands (`git ...`, configurable) supported.
- **Onboarding Experience:** Automatic greeting embed on first server invite explaining setup and commands.
- **Deduplication Engine:** SQLite-backed state tracking prevents duplicate notifications across restarts.
- **Rate-Limit Aware:** Exponential backoff, HTTP 429 compliance, and request throttling.
- **Security-Hardened:** SSRF protection, mention defanging (`@everyone` / `@here` stripping), and credential sanitization in logs.

---

## 3. Supported Git Providers

Gitcord features a modular provider abstraction (`GitProvider`):

| Provider | Supported Instances | Features Supported |
| :--- | :--- | :--- |
| **GitHub** | `https://github.com`, GitHub Enterprise | Commits, Issues, PRs, Releases, Users, Branches, Public Events |
| **GitLab** | `https://gitlab.com`, Self-hosted GitLab | Commits, Issues, MRs, Releases, Users, Branches, Project Events |
| **Gitea** | Self-hosted Gitea instances | Commits, Issues, PRs, Releases, Users, Branches, Feeds |
| **Forgejo** | `https://codeberg.org`, Self-hosted Forgejo | Commits, Issues, PRs, Releases, Users, Branches, Feeds |
| **Generic** | Any standard Git HTTP instance | Fallback tracking and basic repository discovery |

---

## 4. Requirements

- **Production (Docker):**
  - Docker Engine 20.10+
  - Docker Compose v2+
  *(Host does not need Node.js installed)*
- **Local Development:**
  - Node.js 20 LTS or higher
  - npm 9+

---

## 5. Docker Installation

The quickest way to run Gitcord in production:

```bash
# 1. Clone repository
git clone https://github.com/your-org/gitcord.git
cd gitcord

# 2. Copy and configure environment file
cp .env.example .env
nano .env

# 3. Deploy slash commands to Discord
npm install
npm run deploy-commands

# 4. Start the container in background
docker compose up -d
```

To view logs:
```bash
docker compose logs -f
```

To update or restart:
```bash
docker compose restart
```

---

## 6. Environment Variables

All configuration is managed via `.env`:

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `DISCORD_TOKEN` | **Yes** | — | Discord Bot Token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | **Yes** | — | Discord Application Client ID |
| `DISCORD_GUILD_ID` | No | — | Optional Guild ID for instant development slash command deployment |
| `PREFIX` | No | `git` | Default command prefix for text messages |
| `DATABASE_URL` | No | `./data/gitcord.sqlite` | SQLite database file path (persisted in `/app/data` in Docker) |
| `POLL_INTERVAL_SECONDS` | No | `60` | Git API polling interval in seconds (minimum 5s) |
| `LOG_LEVEL` | No | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `GITHUB_TOKEN` | No | — | Optional GitHub Personal Access Token (PAT) for higher rate limits |
| `GITLAB_TOKEN` | No | — | Optional GitLab Personal Access Token |
| `GITEA_TOKEN` | No | — | Optional Gitea API Token |
| `FORGEJO_TOKEN` | No | — | Optional Forgejo API Token |

---

## 7. Discord Bot Creation

1. Navigate to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and enter `Gitcord`.
3. Go to the **Bot** tab:
   - Click **Add Bot** / **Reset Token** to copy your bot token into `DISCORD_TOKEN`.
   - Under **Privileged Gateway Intents**, enable:
     - **Message Content Intent** (required for prefix commands like `git help`).
     - **Server Members Intent** (optional, recommended for guild management).
4. Go to **General Information** and copy the **Application ID** into `DISCORD_CLIENT_ID`.

---

## 8. Required Intents

Gitcord requests only the minimal necessary gateway intents:
- `GatewayIntentBits.Guilds`: Necessary to track server join/leave events, manage guild channels, and read channel permissions.
- `GatewayIntentBits.GuildMessages`: Necessary to listen for message commands.
- `GatewayIntentBits.MessageContent`: Privileged intent required to read message text when executing prefix commands (e.g., `git follow`).

Gitcord intentionally does **not** request unnecessary privileged intents or administrator permissions.

---

## 9. Command Deployment

Before slash commands appear in Discord, register them using the deployment script:

```bash
# Register commands globally (takes up to 1 hour to propagate across Discord)
npm run deploy-commands

# For instant guild-level command registration during testing, specify DISCORD_GUILD_ID in .env:
DISCORD_GUILD_ID=123456789012345678 npm run deploy-commands
```

---

## 10. Inviting the Bot

Generate an invite URL with the required permissions:
- Scopes: `bot`, `applications.commands`
- Bot Permissions:
  - `View Channels` (1024)
  - `Send Messages` (2048)
  - `Embed Links` (16384)
  - `Read Message History` (65536)

Example invite URL template:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=84992&scope=bot%20applications.commands
```

---

## 11. Initial Server Setup

When Gitcord joins a server, it sends a welcome onboarding embed to the system channel explaining features and commands.

To configure notification delivery:

### Using Slash Commands:
```
/git setup channel:#git-feed commits:True issues:True prs:True releases:True
```

### Using Prefix Commands:
Navigate to the channel you wish to designate as the notification channel and type:
```
git setup
```

---

## 12. Following a Git User

Track developer activity across any supported instance:

```
/git follow target:m5rcel instance:https://github.com
```
or via prefix:
```
git follow m5rcel user https://github.com
```

Gitcord will periodically poll their public event stream and broadcast their commits and activity.

---

## 13. Following a Repository

Subscribe a channel to a repository:

### By Full URL:
```
/git follow target:https://github.com/m5rcel/Gitcord
```
or for Codeberg / Forgejo:
```
/git follow target:https://codeberg.org/forgejo/forgejo
```

### By Shorthand (defaults to GitHub):
```
/git follow target:octocat/Hello-World
```

Gitcord automatically identifies the provider, verifies accessibility, seeds initial events to prevent spam, and begins monitoring.

---

## 14. Configuring Notifications

Administrators can toggle individual event types per server:
- **Commits:** New commits with author, message, and line statistics.
- **Issues:** Issues opened, closed, or reopened.
- **Pull Requests / MRs:** PRs opened, merged, or closed.
- **Releases:** New version releases and tags.

Use `/git setup` to adjust toggles at any time.

---

## 15. Provider Authentication

Public repositories can be tracked without API tokens. For private instances or to avoid unauthenticated API rate limits:

1. Create a **read-only** personal access token on your Git hosting provider.
2. Place the token in `.env`:
   ```env
   GITHUB_TOKEN=ghp_...
   GITLAB_TOKEN=glpat-...
   GITEA_TOKEN=...
   FORGEJO_TOKEN=...
   ```
3. Restart the container: `docker compose restart`.

Gitcord scrubs and redacts all tokens from logs and Discord responses.

---

## 16. Troubleshooting

- **Slash commands not showing:**
  Run `npm run deploy-commands`. Note that global Discord commands may take up to an hour to cache across Discord client apps; using `DISCORD_GUILD_ID` provides immediate testing.
- **Prefix commands not responding:**
  Ensure the bot role has `View Channel`, `Send Messages`, and `Read Message History` permissions in that channel, and verify `Message Content Intent` is enabled in Discord Developer Portal.
- **"Statistics unavailable" on commits:**
  Some providers (or very large merge commits) omit changed line counts from their summary API responses. Gitcord honestly displays `Statistics unavailable` rather than inventing numbers.

---

## 17. Rate Limits

Gitcord respects all Git provider rate limits:
- Reads `x-ratelimit-remaining` and `x-ratelimit-reset` headers.
- Automatically backs off when receiving HTTP 429 Too Many Requests, respecting `Retry-After`.
- Request rate throttling with exponential backoff on transient network faults.
- Configurable polling interval via `POLL_INTERVAL_SECONDS` (default: 60s).

---

## 18. Security

- **Strictly Read-Only:** Architecture provides no routes, methods, or commands capable of mutating remote repositories.
- **SSRF Prevention:** Instance URLs are validated against private, loopback, and link-local IPv4/IPv6 ranges (e.g. `127.0.0.1`, `169.254.169.254`, `10.0.0.0/8`, `192.168.0.0/16`).
- **Mention Defanging:** All bot replies and notification dispatches enforce `{ allowedMentions: { parse: [] } }` and sanitize content against `@everyone`, `@here`, and role pings.
- **Response Size Limits:** Responses from remote Git APIs are capped at 5 MB to prevent memory exhaustion attacks.
- **Safe Error Handling:** Stack traces are logged server-side and never exposed to Discord users.

---

## 19. Discord WebSocket Initialization

Gitcord intentionally configures the Discord WebSocket client identify properties during startup prior to establishing its WebSocket gateway connection:

```javascript
// Source - https://stackoverflow.com/a/77072376 
// Posted by Alexandre888 
// Retrieved 2026-09-03, License - CC BY-SA 4.0 
const { 
  DefaultWebSocketManagerOptions: { 
    identifyProperties 
  } 
} = require("@discordjs/ws"); 
identifyProperties.browser = "Discord Android"; // or "Discord iOS"
```

This ensures the bot identifies as `Discord Android` on gateway handshake. This initialization is implemented in `src/bot/ws-init.ts` and verified by automated unit tests in `tests/client/ws-init.test.ts`.

---

## 20. Development

```bash
# Install dependencies
npm install

# Run TypeScript typecheck
npm run build

# Run comprehensive test suite
npm test

# Run bot locally in watch/development mode
npm run dev
```

---

## 21. Adding Another Git Provider

Gitcord's modular architecture makes adding custom or new Git providers simple:

1. Create a new provider file in `src/git/providers/MyNewProvider.ts` extending `GitProvider`:
   ```typescript
   import { GitProvider } from "./GitProvider";

   export class MyNewProvider extends GitProvider {
     readonly name = "MyProvider";
     readonly type = "myprovider";
     readonly iconUrl = "https://example.com/icon.png";
     readonly color = 0x123456;

     async detectInstance(baseUrl: string): Promise<boolean> {
       return baseUrl.includes("mygit.com");
     }

     // Implement getUser, getRepository, getRecentCommits, getCommitDetails, etc.
   }
   ```
2. Register the class in `src/git/providers/index.ts` within `ProviderRegistry`:
   ```typescript
   this.providers.push(new MyNewProvider(config.myProviderToken));
   ```
3. Add any necessary provider-specific unit tests in `tests/providers/`.

---

## License

MIT License. Copyright (c) 2026 Gitcord Contributors. See [LICENSE](LICENSE) for details.
