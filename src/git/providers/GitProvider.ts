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
import { HttpClient } from "../../utils/http-client";

export interface ProviderBrandInfo {
  name: string;
  iconUrl: string;
  color: number;
}

export abstract class GitProvider {
  protected httpClient: HttpClient;

  constructor(token?: string) {
    this.httpClient = new HttpClient({ token });
  }

  abstract readonly name: string;
  abstract readonly type: string;
  abstract readonly iconUrl: string;
  abstract readonly color: number;

  getBrandInfo(): ProviderBrandInfo {
    return {
      name: this.name,
      iconUrl: this.iconUrl,
      color: this.color,
    };
  }

  /**
   * Tests whether this provider matches a given instance URL
   */
  abstract detectInstance(baseUrl: string): Promise<boolean>;

  /**
   * Fetches user profile data
   */
  abstract getUser(instanceUrl: string, username: string): Promise<GitUser | null>;

  /**
   * Fetches repository details
   */
  abstract getRepository(instanceUrl: string, owner: string, name: string): Promise<GitRepository | null>;

  /**
   * Fetches recent commits
   */
  abstract getRecentCommits(
    instanceUrl: string,
    owner: string,
    name: string,
    options?: { branch?: string; limit?: number }
  ): Promise<GitCommitSummary[]>;

  /**
   * Fetches full commit details including diff statistics
   */
  abstract getCommitDetails(
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
  } | null>;

  /**
   * Fetches recent issues
   */
  abstract getRecentIssues(
    instanceUrl: string,
    owner: string,
    name: string,
    options?: { limit?: number; state?: "open" | "closed" | "all" }
  ): Promise<IssueEvent[]>;

  /**
   * Fetches recent pull requests / merge requests
   */
  abstract getRecentPullRequests(
    instanceUrl: string,
    owner: string,
    name: string,
    options?: { limit?: number; state?: "open" | "closed" | "all" }
  ): Promise<PullRequestEvent[]>;

  /**
   * Fetches recent branches
   */
  abstract getBranches(instanceUrl: string, owner: string, name: string): Promise<GitBranch[]>;

  /**
   * Fetches recent releases
   */
  abstract getRecentReleases(instanceUrl: string, owner: string, name: string): Promise<ReleaseEvent[]>;

  /**
   * Fetches recent activity events for a user
   */
  abstract getUserRecentActivity(instanceUrl: string, username: string): Promise<NormalizedGitEvent[]>;

  /**
   * Fetches recent activity events for a repository
   */
  abstract getRepoRecentActivity(
    instanceUrl: string,
    owner: string,
    name: string
  ): Promise<NormalizedGitEvent[]>;
}
