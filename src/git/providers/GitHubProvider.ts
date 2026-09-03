import { GitProvider } from "./GitProvider";
import {
  GitUser,
  GitRepository,
  GitBranch,
  GitCommitSummary,
  CommitStatistics,
  IssueEvent,
  PullRequestEvent,
  ReleaseEvent,
  NormalizedGitEvent,
  CommitEvent,
} from "../models";
import { logger } from "../../utils/logger";

interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  author?: { login: string; avatar_url: string };
  html_url: string;
  stats?: { total: number; additions: number; deletions: number };
  files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}

export class GitHubProvider extends GitProvider {
  readonly name = "GitHub";
  readonly type = "github";
  readonly iconUrl = "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";
  readonly color = 0x24292e;

  private getApiUrl(instanceUrl: string): string {
    const norm = instanceUrl.replace(/\/+$/, "");
    if (norm === "https://github.com" || norm === "http://github.com") {
      return "https://api.github.com";
    }
    // GitHub Enterprise Server uses /api/v3
    return `${norm}/api/v3`;
  }

  async detectInstance(baseUrl: string): Promise<boolean> {
    const norm = baseUrl.toLowerCase().replace(/\/+$/, "");
    if (norm.includes("github.com")) return true;

    try {
      const res = await this.httpClient.get<{ installed_version?: string }>(`${norm}/api/v3`);
      return res.status === 200 || res.headers.get("x-github-request-id") !== null;
    } catch {
      return false;
    }
  }

  async getUser(instanceUrl: string, username: string): Promise<GitUser | null> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<{
        login: string;
        name?: string;
        avatar_url: string;
        bio?: string;
        html_url: string;
        public_repos?: number;
        followers?: number;
        following?: number;
      }>(`${api}/users/${encodeURIComponent(username)}`);

      if (res.status !== 200 || !res.data) return null;

      return {
        username: res.data.login,
        displayName: res.data.name || res.data.login,
        avatarUrl: res.data.avatar_url,
        bio: res.data.bio || undefined,
        profileUrl: res.data.html_url,
        repositoriesCount: res.data.public_repos,
        followersCount: res.data.followers,
        followingCount: res.data.following,
        instanceUrl,
      };
    } catch (err) {
      logger.error(`Failed to fetch GitHub user ${username}`, err);
      return null;
    }
  }

  async getRepository(instanceUrl: string, owner: string, name: string): Promise<GitRepository | null> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<{
        name: string;
        full_name: string;
        description?: string;
        html_url: string;
        default_branch: string;
        stargazers_count?: number;
        forks_count?: number;
        open_issues_count?: number;
        license?: { spdx_id?: string; name?: string };
        pushed_at?: string;
      }>(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);

      if (res.status !== 200 || !res.data) return null;

      return {
        owner,
        name: res.data.name,
        fullName: res.data.full_name,
        description: res.data.description || undefined,
        url: res.data.html_url,
        defaultBranch: res.data.default_branch || "main",
        starsCount: res.data.stargazers_count,
        forksCount: res.data.forks_count,
        openIssuesCount: res.data.open_issues_count,
        license: res.data.license?.spdx_id || res.data.license?.name,
        lastActivityAt: res.data.pushed_at,
        instanceUrl,
      };
    } catch (err) {
      logger.error(`Failed to fetch GitHub repo ${owner}/${name}`, err);
      return null;
    }
  }

  async getRecentCommits(
    instanceUrl: string,
    owner: string,
    name: string,
    options: { branch?: string; limit?: number } = {}
  ): Promise<GitCommitSummary[]> {
    const api = this.getApiUrl(instanceUrl);
    const limit = Math.min(options.limit || 10, 30);
    const params = new URLSearchParams({ per_page: limit.toString() });
    if (options.branch) params.set("sha", options.branch);

    try {
      const res = await this.httpClient.get<GitHubCommitResponse[]>(
        `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?${params}`
      );

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((c) => ({
        id: c.sha,
        shortId: c.sha.substring(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.author?.login || c.commit.author.name,
        avatarUrl: c.author?.avatar_url,
        date: c.commit.author.date,
        url: c.html_url,
      }));
    } catch (err) {
      logger.error(`Failed to fetch commits for ${owner}/${name}`, err);
      return [];
    }
  }

  async getCommitDetails(
    instanceUrl: string,
    owner: string,
    name: string,
    sha: string
  ): Promise<{
    statistics: CommitStatistics;
    message: string;
    author: { username: string; displayName?: string; avatarUrl?: string };
    date: string;
    url: string;
  } | null> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<GitHubCommitResponse>(
        `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(sha)}`
      );

      if (res.status !== 200 || !res.data) return null;

      const data = res.data;
      const files = data.files || [];

      let filesAdded = 0;
      let filesModified = 0;
      let filesDeleted = 0;

      for (const f of files) {
        if (f.status === "added") filesAdded++;
        else if (f.status === "removed") filesDeleted++;
        else filesModified++;
      }

      const statistics: CommitStatistics = {
        filesChanged: files.length || data.stats?.total || 0,
        filesAdded,
        filesModified,
        filesDeleted,
        linesAdded: data.stats?.additions,
        linesRemoved: data.stats?.deletions,
      };

      return {
        statistics,
        message: data.commit.message,
        author: {
          username: data.author?.login || data.commit.author.name,
          displayName: data.commit.author.name,
          avatarUrl: data.author?.avatar_url,
        },
        date: data.commit.author.date,
        url: data.html_url,
      };
    } catch (err) {
      logger.error(`Failed to fetch commit details for ${sha}`, err);
      return null;
    }
  }

  async getRecentIssues(
    instanceUrl: string,
    owner: string,
    name: string,
    options: { limit?: number; state?: "open" | "closed" | "all" } = {}
  ): Promise<IssueEvent[]> {
    const api = this.getApiUrl(instanceUrl);
    const limit = Math.min(options.limit || 10, 30);
    const state = options.state || "all";
    const params = new URLSearchParams({ per_page: limit.toString(), state });

    try {
      const res = await this.httpClient.get<
        Array<{
          number: number;
          title: string;
          body?: string;
          state: string;
          html_url: string;
          created_at: string;
          pull_request?: unknown;
          user: { login: string; avatar_url: string };
        }>
      >(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?${params}`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      // Filter out Pull Requests returned by the issues endpoint
      return res.data
        .filter((item) => !item.pull_request)
        .map((item) => ({
          type: "issue" as const,
          action: item.state === "closed" ? "closed" : "opened",
          provider: this.type,
          instance: instanceUrl,
          repository: {
            name,
            owner,
            url: `${instanceUrl}/${owner}/${name}`,
          },
          author: {
            username: item.user.login,
            avatarUrl: item.user.avatar_url,
          },
          issue: {
            number: item.number,
            title: item.title,
            bodyPreview: item.body ? item.body.slice(0, 300) : undefined,
            state: item.state,
            url: item.html_url,
            date: item.created_at,
          },
        }));
    } catch (err) {
      logger.error(`Failed to fetch GitHub issues for ${owner}/${name}`, err);
      return [];
    }
  }

  async getRecentPullRequests(
    instanceUrl: string,
    owner: string,
    name: string,
    options: { limit?: number; state?: "open" | "closed" | "all" } = {}
  ): Promise<PullRequestEvent[]> {
    const api = this.getApiUrl(instanceUrl);
    const limit = Math.min(options.limit || 10, 30);
    const state = options.state || "all";
    const params = new URLSearchParams({ per_page: limit.toString(), state });

    try {
      const res = await this.httpClient.get<
        Array<{
          number: number;
          title: string;
          body?: string;
          state: string;
          html_url: string;
          created_at: string;
          merged_at?: string;
          user: { login: string; avatar_url: string };
        }>
      >(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?${params}`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((pr) => {
        let action: PullRequestEvent["action"] = "opened";
        if (pr.merged_at) action = "merged";
        else if (pr.state === "closed") action = "closed";

        return {
          type: "pull_request" as const,
          action,
          provider: this.type,
          instance: instanceUrl,
          repository: {
            name,
            owner,
            url: `${instanceUrl}/${owner}/${name}`,
          },
          author: {
            username: pr.user.login,
            avatarUrl: pr.user.avatar_url,
          },
          pullRequest: {
            number: pr.number,
            title: pr.title,
            bodyPreview: pr.body ? pr.body.slice(0, 300) : undefined,
            state: pr.state,
            url: pr.html_url,
            date: pr.created_at,
          },
        };
      });
    } catch (err) {
      logger.error(`Failed to fetch GitHub PRs for ${owner}/${name}`, err);
      return [];
    }
  }

  async getBranches(instanceUrl: string, owner: string, name: string): Promise<GitBranch[]> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<Array<{ name: string; commit: { sha: string } }>>(
        `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches?per_page=15`
      );

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((b) => ({
        name: b.name,
        commitSha: b.commit.sha,
      }));
    } catch (err) {
      logger.error(`Failed to fetch branches for ${owner}/${name}`, err);
      return [];
    }
  }

  async getRecentReleases(instanceUrl: string, owner: string, name: string): Promise<ReleaseEvent[]> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<
        Array<{
          name: string;
          tag_name: string;
          html_url: string;
          body?: string;
          published_at: string;
          author?: { login: string };
        }>
      >(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?per_page=5`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((r) => ({
        type: "release" as const,
        provider: this.type,
        instance: instanceUrl,
        repository: {
          name,
          owner,
          url: `${instanceUrl}/${owner}/${name}`,
        },
        release: {
          name: r.name || r.tag_name,
          tagName: r.tag_name,
          url: r.html_url,
          author: r.author?.login,
          bodyPreview: r.body ? r.body.slice(0, 300) : undefined,
          publishedAt: r.published_at,
        },
      }));
    } catch (err) {
      logger.error(`Failed to fetch releases for ${owner}/${name}`, err);
      return [];
    }
  }

  async getUserRecentActivity(instanceUrl: string, username: string): Promise<NormalizedGitEvent[]> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<
        Array<{
          id: string;
          type: string;
          repo: { name: string };
          created_at: string;
          payload: {
            commits?: Array<{ sha: string; message: string }>;
            issue?: { number: number; title: string; body?: string; state: string; html_url: string };
            pull_request?: { number: number; title: string; body?: string; state: string; html_url: string; merged?: boolean };
            action?: string;
          };
        }>
      >(`${api}/users/${encodeURIComponent(username)}/events/public?per_page=15`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      const events: NormalizedGitEvent[] = [];

      for (const ev of res.data) {
        const [owner, name] = ev.repo.name.split("/");
        if (!owner || !name) continue;

        if (ev.type === "PushEvent" && Array.isArray(ev.payload?.commits)) {
          for (const c of ev.payload.commits) {
            // Need commit details for diff statistics
            const details = await this.getCommitDetails(instanceUrl, owner, name, c.sha);
            events.push({
              type: "commit",
              provider: this.type,
              instance: instanceUrl,
              repository: {
                name,
                owner,
                url: `${instanceUrl}/${owner}/${name}`,
              },
              author: {
                username,
                avatarUrl: details?.author.avatarUrl,
              },
              commit: {
                id: c.sha,
                shortId: c.sha.substring(0, 7),
                message: c.message,
                url: `${instanceUrl}/${owner}/${name}/commit/${c.sha}`,
                date: ev.created_at,
              },
              statistics: details?.statistics || {
                filesChanged: 1,
                isUnavailable: true,
              },
            });
          }
        } else if (ev.type === "IssuesEvent" && ev.payload?.issue) {
          const action = ev.payload.action === "closed" ? "closed" : ev.payload.action === "reopened" ? "reopened" : "opened";
          events.push({
            type: "issue",
            action,
            provider: this.type,
            instance: instanceUrl,
            repository: { name, owner, url: `${instanceUrl}/${owner}/${name}` },
            author: { username },
            issue: {
              number: ev.payload.issue.number,
              title: ev.payload.issue.title,
              bodyPreview: ev.payload.issue.body?.slice(0, 300),
              state: ev.payload.issue.state,
              url: ev.payload.issue.html_url,
              date: ev.created_at,
            },
          });
        } else if (ev.type === "PullRequestEvent" && ev.payload?.pull_request) {
          const action = ev.payload.pull_request.merged ? "merged" : ev.payload.action === "closed" ? "closed" : "opened";
          events.push({
            type: "pull_request",
            action,
            provider: this.type,
            instance: instanceUrl,
            repository: { name, owner, url: `${instanceUrl}/${owner}/${name}` },
            author: { username },
            pullRequest: {
              number: ev.payload.pull_request.number,
              title: ev.payload.pull_request.title,
              bodyPreview: ev.payload.pull_request.body?.slice(0, 300),
              state: ev.payload.pull_request.state,
              url: ev.payload.pull_request.html_url,
              date: ev.created_at,
            },
          });
        }
      }

      return events;
    } catch (err) {
      logger.error(`Failed to fetch GitHub user activity for ${username}`, err);
      return [];
    }
  }

  async getRepoRecentActivity(instanceUrl: string, owner: string, name: string): Promise<NormalizedGitEvent[]> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<
        Array<{
          id: string;
          type: string;
          actor: { login: string; avatar_url: string };
          created_at: string;
          payload: {
            commits?: Array<{ sha: string; message: string }>;
            action?: string;
          };
        }>
      >(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/events?per_page=15`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      const events: NormalizedGitEvent[] = [];

      for (const ev of res.data) {
        if (ev.type === "PushEvent" && Array.isArray(ev.payload?.commits)) {
          for (const c of ev.payload.commits) {
            const details = await this.getCommitDetails(instanceUrl, owner, name, c.sha);
            events.push({
              type: "commit",
              provider: this.type,
              instance: instanceUrl,
              repository: {
                name,
                owner,
                url: `${instanceUrl}/${owner}/${name}`,
              },
              author: {
                username: ev.actor.login,
                avatarUrl: ev.actor.avatar_url,
              },
              commit: {
                id: c.sha,
                shortId: c.sha.substring(0, 7),
                message: c.message,
                url: `${instanceUrl}/${owner}/${name}/commit/${c.sha}`,
                date: ev.created_at,
              },
              statistics: details?.statistics || {
                filesChanged: 1,
                isUnavailable: true,
              },
            });
          }
        }
      }

      return events;
    } catch (err) {
      logger.error(`Failed to fetch GitHub repo activity for ${owner}/${name}`, err);
      return [];
    }
  }
}
