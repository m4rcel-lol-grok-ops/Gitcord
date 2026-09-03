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

export class GenericProvider extends GitProvider {
  readonly name: string = "Git";
  readonly type: string = "generic";
  readonly iconUrl: string = "https://git-scm.com/images/logos/downloads/Git-Icon-1788C.png";
  readonly color: number = 0xf05032;

  async detectInstance(_baseUrl: string): Promise<boolean> {
    // Generic provider matches as a fallback when no specific provider claimed the instance
    return true;
  }

  async getUser(instanceUrl: string, username: string): Promise<GitUser | null> {
    return {
      username,
      profileUrl: `${instanceUrl}/${username}`,
      instanceUrl,
    };
  }

  async getRepository(instanceUrl: string, owner: string, name: string): Promise<GitRepository | null> {
    return {
      owner,
      name,
      fullName: `${owner}/${name}`,
      url: `${instanceUrl}/${owner}/${name}`,
      defaultBranch: "main",
      instanceUrl,
    };
  }

  async getRecentCommits(
    _instanceUrl: string,
    _owner: string,
    _name: string,
    _options?: { branch?: string; limit?: number }
  ): Promise<GitCommitSummary[]> {
    return [];
  }

  async getCommitDetails(
    _instanceUrl: string,
    _owner: string,
    _name: string,
    _sha: string
  ): Promise<{
    statistics: CommitStatistics;
    message: string;
    author: { username: string; displayName?: string; avatarUrl?: string };
    date: string;
    url: string;
  } | null> {
    return null;
  }

  async getRecentIssues(
    _instanceUrl: string,
    _owner: string,
    _name: string,
    _options?: { limit?: number; state?: "open" | "closed" | "all" }
  ): Promise<IssueEvent[]> {
    return [];
  }

  async getRecentPullRequests(
    _instanceUrl: string,
    _owner: string,
    _name: string,
    _options?: { limit?: number; state?: "open" | "closed" | "all" }
  ): Promise<PullRequestEvent[]> {
    return [];
  }

  async getBranches(_instanceUrl: string, _owner: string, _name: string): Promise<GitBranch[]> {
    return [];
  }

  async getRecentReleases(_instanceUrl: string, _owner: string, _name: string): Promise<ReleaseEvent[]> {
    return [];
  }

  async getUserRecentActivity(_instanceUrl: string, _username: string): Promise<NormalizedGitEvent[]> {
    return [];
  }

  async getRepoRecentActivity(
    _instanceUrl: string,
    _owner: string,
    _name: string
  ): Promise<NormalizedGitEvent[]> {
    return [];
  }
}
