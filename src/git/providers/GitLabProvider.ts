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

interface GitLabCommitResponse {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  web_url: string;
  stats?: { additions: number; deletions: number; total: number };
}

interface GitLabDiffItem {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

export class GitLabProvider extends GitProvider {
  readonly name = "GitLab";
  readonly type = "gitlab";
  readonly iconUrl = "https://gitlab.com/assets/gitlab_logo-7ae504fe4f68fdebb39374c70ad5d760438e8337de4c30639b076d7153222a61.png";
  readonly color = 0xfc6d26;

  private getApiUrl(instanceUrl: string): string {
    return `${instanceUrl.replace(/\/+$/, "")}/api/v4`;
  }

  private encodePath(owner: string, name: string): string {
    return encodeURIComponent(`${owner}/${name}`);
  }

  async detectInstance(baseUrl: string): Promise<boolean> {
    const norm = baseUrl.toLowerCase().replace(/\/+$/, "");
    if (norm.includes("gitlab.com")) return true;

    try {
      const res = await this.httpClient.get<{ version?: string }>(`${norm}/api/v4/version`);
      return res.status === 200 || res.headers.get("gitlab-lb-tag") !== null;
    } catch {
      return false;
    }
  }

  async getUser(instanceUrl: string, username: string): Promise<GitUser | null> {
    const api = this.getApiUrl(instanceUrl);
    try {
      const res = await this.httpClient.get<
        Array<{
          id: number;
          username: string;
          name: string;
          avatar_url: string;
          bio?: string;
          web_url: string;
        }>
      >(`${api}/users?username=${encodeURIComponent(username)}`);

      if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
        return null;
      }

      const user = res.data[0];
      return {
        username: user.username,
        displayName: user.name,
        avatarUrl: user.avatar_url,
        bio: user.bio || undefined,
        profileUrl: user.web_url,
        instanceUrl,
      };
    } catch (err) {
      logger.error(`Failed to fetch GitLab user ${username}`, err);
      return null;
    }
  }

  async getRepository(instanceUrl: string, owner: string, name: string): Promise<GitRepository | null> {
    const api = this.getApiUrl(instanceUrl);
    const encoded = this.encodePath(owner, name);
    try {
      const res = await this.httpClient.get<{
        id: number;
        name: string;
        path_with_namespace: string;
        description?: string;
        web_url: string;
        default_branch: string;
        star_count?: number;
        forks_count?: number;
        open_issues_count?: number;
        last_activity_at?: string;
      }>(`${api}/projects/${encoded}`);

      if (res.status !== 200 || !res.data) return null;

      return {
        owner,
        name: res.data.name,
        fullName: res.data.path_with_namespace,
        description: res.data.description || undefined,
        url: res.data.web_url,
        defaultBranch: res.data.default_branch || "main",
        starsCount: res.data.star_count,
        forksCount: res.data.forks_count,
        openIssuesCount: res.data.open_issues_count,
        lastActivityAt: res.data.last_activity_at,
        instanceUrl,
      };
    } catch (err) {
      logger.error(`Failed to fetch GitLab repo ${owner}/${name}`, err);
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
    const encoded = this.encodePath(owner, name);
    const limit = Math.min(options.limit || 10, 30);
    const params = new URLSearchParams({ per_page: limit.toString() });
    if (options.branch) params.set("ref_name", options.branch);

    try {
      const res = await this.httpClient.get<GitLabCommitResponse[]>(
        `${api}/projects/${encoded}/repository/commits?${params}`
      );

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((c) => ({
        id: c.id,
        shortId: c.short_id,
        message: c.title,
        author: c.author_name,
        date: c.authored_date,
        url: c.web_url,
      }));
    } catch (err) {
      logger.error(`Failed to fetch GitLab commits for ${owner}/${name}`, err);
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
    const encoded = this.encodePath(owner, name);
    try {
      const [commitRes, diffRes] = await Promise.all([
        this.httpClient.get<GitLabCommitResponse>(`${api}/projects/${encoded}/repository/commits/${encodeURIComponent(sha)}`),
        this.httpClient.get<GitLabDiffItem[]>(`${api}/projects/${encoded}/repository/commits/${encodeURIComponent(sha)}/diff`),
      ]);

      if (commitRes.status !== 200 || !commitRes.data) return null;

      const data = commitRes.data;
      const diffs = Array.isArray(diffRes.data) ? diffRes.data : [];

      let filesAdded = 0;
      let filesModified = 0;
      let filesDeleted = 0;

      for (const d of diffs) {
        if (d.new_file) filesAdded++;
        else if (d.deleted_file) filesDeleted++;
        else filesModified++;
      }

      const statistics: CommitStatistics = {
        filesChanged: diffs.length || data.stats?.total || 0,
        filesAdded,
        filesModified,
        filesDeleted,
        linesAdded: data.stats?.additions,
        linesRemoved: data.stats?.deletions,
      };

      return {
        statistics,
        message: data.message,
        author: {
          username: data.author_name,
          displayName: data.author_name,
        },
        date: data.authored_date,
        url: data.web_url,
      };
    } catch (err) {
      logger.error(`Failed to fetch GitLab commit details for ${sha}`, err);
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
    const encoded = this.encodePath(owner, name);
    const limit = Math.min(options.limit || 10, 30);
    const state = options.state === "open" ? "opened" : options.state || "all";
    const params = new URLSearchParams({ per_page: limit.toString(), state });

    try {
      const res = await this.httpClient.get<
        Array<{
          iid: number;
          title: string;
          description?: string;
          state: string;
          web_url: string;
          created_at: string;
          author: { username: string; name: string; avatar_url: string };
        }>
      >(`${api}/projects/${encoded}/issues?${params}`);

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
          username: item.author.username,
          displayName: item.author.name,
          avatarUrl: item.author.avatar_url,
        },
        issue: {
          number: item.iid,
          title: item.title,
          bodyPreview: item.description ? item.description.slice(0, 300) : undefined,
          state: item.state,
          url: item.web_url,
          date: item.created_at,
        },
      }));
    } catch (err) {
      logger.error(`Failed to fetch GitLab issues for ${owner}/${name}`, err);
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
    const encoded = this.encodePath(owner, name);
    const limit = Math.min(options.limit || 10, 30);
    const state = options.state === "open" ? "opened" : options.state || "all";
    const params = new URLSearchParams({ per_page: limit.toString(), state });

    try {
      const res = await this.httpClient.get<
        Array<{
          iid: number;
          title: string;
          description?: string;
          state: string;
          web_url: string;
          created_at: string;
          author: { username: string; name: string; avatar_url: string };
        }>
      >(`${api}/projects/${encoded}/merge_requests?${params}`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((mr) => {
        let action: PullRequestEvent["action"] = "opened";
        if (mr.state === "merged") action = "merged";
        else if (mr.state === "closed") action = "closed";

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
            username: mr.author.username,
            displayName: mr.author.name,
            avatarUrl: mr.author.avatar_url,
          },
          pullRequest: {
            number: mr.iid,
            title: mr.title,
            bodyPreview: mr.description ? mr.description.slice(0, 300) : undefined,
            state: mr.state,
            url: mr.web_url,
            date: mr.created_at,
          },
        };
      });
    } catch (err) {
      logger.error(`Failed to fetch GitLab MRs for ${owner}/${name}`, err);
      return [];
    }
  }

  async getBranches(instanceUrl: string, owner: string, name: string): Promise<GitBranch[]> {
    const api = this.getApiUrl(instanceUrl);
    const encoded = this.encodePath(owner, name);
    try {
      const res = await this.httpClient.get<Array<{ name: string; commit: { id: string } }>>(
        `${api}/projects/${encoded}/repository/branches?per_page=15`
      );

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      return res.data.map((b) => ({
        name: b.name,
        commitSha: b.commit.id,
      }));
    } catch (err) {
      logger.error(`Failed to fetch GitLab branches for ${owner}/${name}`, err);
      return [];
    }
  }

  async getRecentReleases(instanceUrl: string, owner: string, name: string): Promise<ReleaseEvent[]> {
    const api = this.getApiUrl(instanceUrl);
    const encoded = this.encodePath(owner, name);
    try {
      const res = await this.httpClient.get<
        Array<{
          name: string;
          tag_name: string;
          description?: string;
          released_at: string;
          author?: { username: string };
          _links?: { self?: string };
        }>
      >(`${api}/projects/${encoded}/releases?per_page=5`);

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
          name: r.name,
          tagName: r.tag_name,
          url: `${instanceUrl}/${owner}/${name}/-/releases/${encodeURIComponent(r.tag_name)}`,
          author: r.author?.username,
          bodyPreview: r.description ? r.description.slice(0, 300) : undefined,
          publishedAt: r.released_at,
        },
      }));
    } catch (err) {
      logger.error(`Failed to fetch GitLab releases for ${owner}/${name}`, err);
      return [];
    }
  }

  async getUserRecentActivity(instanceUrl: string, username: string): Promise<NormalizedGitEvent[]> {
    const user = await this.getUser(instanceUrl, username);
    if (!user) return [];

    const api = this.getApiUrl(instanceUrl);
    try {
      // Find GitLab user id
      const userRes = await this.httpClient.get<Array<{ id: number }>>(
        `${api}/users?username=${encodeURIComponent(username)}`
      );
      if (!Array.isArray(userRes.data) || userRes.data.length === 0) return [];

      const userId = userRes.data[0].id;
      const res = await this.httpClient.get<
        Array<{
          action_name: string;
          created_at: string;
          target_type: string | null;
          push_data?: { commit_to?: string; commit_title?: string; commit_count?: number };
          project_id: number;
        }>
      >(`${api}/users/${userId}/events?per_page=15`);

      if (res.status !== 200 || !Array.isArray(res.data)) return [];

      const events: NormalizedGitEvent[] = [];

      for (const ev of res.data) {
        if (ev.push_data?.commit_to) {
          events.push({
            type: "commit",
            provider: this.type,
            instance: instanceUrl,
            repository: {
              name: `project-${ev.project_id}`,
              owner: username,
              url: `${instanceUrl}`,
            },
            author: {
              username,
              avatarUrl: user.avatarUrl,
            },
            commit: {
              id: ev.push_data.commit_to,
              shortId: ev.push_data.commit_to.substring(0, 7),
              message: ev.push_data.commit_title || "Commit",
              url: `${instanceUrl}`,
              date: ev.created_at,
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
      logger.error(`Failed to fetch GitLab user activity for ${username}`, err);
      return [];
    }
  }

  async getRepoRecentActivity(instanceUrl: string, owner: string, name: string): Promise<NormalizedGitEvent[]> {
    // Commits + Issues + MRs
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
        author: { username: c.author },
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
