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
} from "../models";
import { logger } from "../../utils/logger";

interface GiteaCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  author?: { login: string; avatar_url: string; full_name?: string };
  html_url: string;
  stats?: { total: number; additions: number; deletions: number };
  files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}

export class GiteaProvider extends GitProvider {
  readonly name: string = "Gitea";
  readonly type: string = "gitea";
  readonly iconUrl: string = "https://gitea.com/assets/img/gitea.svg";
  readonly color: number = 0x609926;

  protected getApiUrl(instanceUrl: string): string {
    return `${instanceUrl.replace(/\/+$/, "")}/api/v1`;
  }

  async detectInstance(baseUrl: string): Promise<boolean> {
    const norm = baseUrl.toLowerCase().replace(/\/+$/, "");
    try {
      const res = await this.httpClient.get<{ version?: string }>(`${norm}/api/v1/version`);
      return res.status === 200 && typeof res.data?.version === "string";
    } catch {
      return false;
    }
  }

  async getUser(instanceUrl: string, username: string): Promise<GitUser | null> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<{
        login: string;
        full_name?: string;
        avatar_url: string;
        description?: string;
        html_url?: string;
      }>(`${api}/users/${encodeURIComponent(username)}`);

      if (res.status !== 200 || !res.data) return null;

      return {
        username: res.data.login,
        displayName: res.data.full_name || res.data.login,
        avatarUrl: res.data.avatar_url,
        bio: res.data.description || undefined,
        profileUrl: res.data.html_url || `${instanceUrl}/${res.data.login}`,
        instanceUrl,
      };
    } catch (err) {
      logger.error(`Failed to fetch Gitea user ${username}`, err);
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
        stars_count?: number;
        forks_count?: number;
        open_issues_count?: number;
        updated_at?: string;
      }>(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);

      if (res.status !== 200 || !res.data) return null;

      return {
        owner,
        name: res.data.name,
        fullName: res.data.full_name,
        description: res.data.description || undefined,
        url: res.data.html_url,
        defaultBranch: res.data.default_branch || "main",
        starsCount: res.data.stars_count,
        forksCount: res.data.forks_count,
        openIssuesCount: res.data.open_issues_count,
        lastActivityAt: res.data.updated_at,
        instanceUrl,
      };
    } catch (err) {
      logger.error(`Failed to fetch Gitea repo ${owner}/${name}`, err);
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
    const params = new URLSearchParams({ limit: limit.toString() });
    if (options.branch) params.set("sha", options.branch);

    try {
      const res = await this.httpClient.get<GiteaCommitResponse[]>(
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
      logger.error(`Failed to fetch Gitea commits for ${owner}/${name}`, err);
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
      const res = await this.httpClient.get<GiteaCommitResponse>(
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
          displayName: data.author?.full_name || data.commit.author.name,
          avatarUrl: data.author?.avatar_url,
        },
        date: data.commit.author.date,
        url: data.html_url,
      };
    } catch (err) {
      logger.error(`Failed to fetch Gitea commit details for ${sha}`, err);
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
    const params = new URLSearchParams({ type: "issues", state, limit: limit.toString() });

    try {
      const res = await this.httpClient.get<
        Array<{
          number: number;
          title: string;
          body?: string;
          state: string;
          html_url: string;
          created_at: string;
          user: { login: string; avatar_url: string; full_name?: string };
        }>
      >(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?${params}`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((item) => ({
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
          displayName: item.user.full_name,
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
      logger.error(`Failed to fetch Gitea issues for ${owner}/${name}`, err);
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
    const params = new URLSearchParams({ state, limit: limit.toString() });

    try {
      const res = await this.httpClient.get<
        Array<{
          number: number;
          title: string;
          body?: string;
          state: string;
          html_url: string;
          created_at: string;
          merged?: boolean;
          user: { login: string; avatar_url: string; full_name?: string };
        }>
      >(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?${params}`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((pr) => {
        let action: PullRequestEvent["action"] = "opened";
        if (pr.merged) action = "merged";
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
            displayName: pr.user.full_name,
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
      logger.error(`Failed to fetch Gitea PRs for ${owner}/${name}`, err);
      return [];
    }
  }

  async getBranches(instanceUrl: string, owner: string, name: string): Promise<GitBranch[]> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<Array<{ name: string; commit: { id: string } }>>(
        `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches?limit=15`
      );

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((b) => ({
        name: b.name,
        commitSha: b.commit.id,
      }));
    } catch (err) {
      logger.error(`Failed to fetch Gitea branches for ${owner}/${name}`, err);
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
          created_at: string;
          author?: { login: string };
        }>
      >(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?limit=5`);

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
          publishedAt: r.created_at,
        },
      }));
    } catch (err) {
      logger.error(`Failed to fetch Gitea releases for ${owner}/${name}`, err);
      return [];
    }
  }

  async getUserRecentActivity(instanceUrl: string, username: string): Promise<NormalizedGitEvent[]> {
    const user = await this.getUser(instanceUrl, username);
    if (!user) return [];

    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<
        Array<{
          op_type: string;
          created: string;
          repo: { name: string; owner: { login: string } };
          content?: string;
        }>
      >(`${api}/users/${encodeURIComponent(username)}/activities/feeds?limit=15`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      const events: NormalizedGitEvent[] = [];

      for (const a of res.data) {
        if (!a.repo) continue;
        const owner = a.repo.owner.login;
        const name = a.repo.name;

        if (a.op_type === "commit_repo") {
          events.push({
            type: "commit",
            provider: this.type,
            instance: instanceUrl,
            repository: { name, owner, url: `${instanceUrl}/${owner}/${name}` },
            author: { username, avatarUrl: user.avatarUrl },
            commit: {
              id: "head",
              shortId: "head",
              message: a.content || "Recent commit",
              url: `${instanceUrl}/${owner}/${name}`,
              date: a.created,
            },
            statistics: {
              filesChanged: 1,
              isUnavailable: true,
            },
          });
        }
      }

      return events;
    } catch (err) {
      logger.error(`Failed to fetch Gitea user activity for ${username}`, err);
      return [];
    }
  }

  async getRepoRecentActivity(instanceUrl: string, owner: string, name: string): Promise<NormalizedGitEvent[]> {
    const [commits, issues, prs] = await Promise.all([
      this.getRecentCommits(instanceUrl, owner, name, { limit: 5 }),
      this.getRecentIssues(instanceUrl, owner, name, { limit: 5 }),
      this.getRecentPullRequests(instanceUrl, owner, name, { limit: 5 }),
    ]);

    const events: NormalizedGitEvent[] = [];

    for (const c of commits) {
      events.push({
        type: "commit",
        provider: this.type,
        instance: instanceUrl,
        repository: { name, owner, url: `${instanceUrl}/${owner}/${name}` },
        author: { username: c.author, avatarUrl: c.avatarUrl },
        commit: {
          id: c.id,
          shortId: c.shortId,
          message: c.message,
          url: c.url,
          date: c.date,
        },
        statistics: {
          filesChanged: 1,
          isUnavailable: true,
        },
      });
    }

    events.push(...issues);
    events.push(...prs);

    return events.sort((a, b) => {
      const dateA = a.type === "commit" ? a.commit.date : a.type === "issue" ? a.issue.date : a.type === "pull_request" ? a.pullRequest.date : "";
      const dateB = b.type === "commit" ? b.commit.date : b.type === "issue" ? b.issue.date : b.type === "pull_request" ? b.pullRequest.date : "";
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }
}
