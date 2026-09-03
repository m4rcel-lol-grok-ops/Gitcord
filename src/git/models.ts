export interface CommitStatistics {
  filesChanged: number;
  filesAdded?: number;
  filesModified?: number;
  filesDeleted?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isUnavailable?: boolean;
}

export interface CommitEvent {
  type: "commit";
  provider: string;
  instance: string;
  repository: {
    name: string;
    owner: string;
    url: string;
  };
  author: {
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  commit: {
    id: string;
    shortId: string;
    message: string;
    url: string;
    date: string;
  };
  statistics: CommitStatistics;
}

export interface IssueEvent {
  type: "issue";
  action: "opened" | "closed" | "reopened";
  provider: string;
  instance: string;
  repository: {
    name: string;
    owner: string;
    url: string;
  };
  author: {
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  issue: {
    number: number;
    title: string;
    bodyPreview?: string;
    state: string;
    url: string;
    date: string;
  };
}

export interface PullRequestEvent {
  type: "pull_request";
  action: "opened" | "closed" | "merged" | "reopened";
  provider: string;
  instance: string;
  repository: {
    name: string;
    owner: string;
    url: string;
  };
  author: {
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  pullRequest: {
    number: number;
    title: string;
    bodyPreview?: string;
    state: string;
    url: string;
    date: string;
  };
}

export interface RepositoryEvent {
  type: "repository";
  action: "created" | "deleted";
  provider: string;
  instance: string;
  repository: {
    name: string;
    owner: string;
    url: string;
    description?: string;
  };
  author?: {
    username: string;
    avatarUrl?: string;
  };
}

export interface ReleaseEvent {
  type: "release";
  provider: string;
  instance: string;
  repository: {
    name: string;
    owner: string;
    url: string;
  };
  release: {
    name: string;
    tagName: string;
    url: string;
    author?: string;
    bodyPreview?: string;
    publishedAt: string;
  };
}

export type NormalizedGitEvent =
  | CommitEvent
  | IssueEvent
  | PullRequestEvent
  | RepositoryEvent
  | ReleaseEvent;

export interface GitUser {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  profileUrl: string;
  repositoriesCount?: number;
  followersCount?: number;
  followingCount?: number;
  instanceUrl: string;
}

export interface GitRepository {
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  url: string;
  defaultBranch: string;
  starsCount?: number;
  forksCount?: number;
  openIssuesCount?: number;
  license?: string;
  lastActivityAt?: string;
  instanceUrl: string;
}

export interface GitBranch {
  name: string;
  commitSha: string;
}

export interface GitCommitSummary {
  id: string;
  shortId: string;
  message: string;
  author: string;
  avatarUrl?: string;
  date: string;
  url: string;
}
