import { describe, it, expect, vi } from "vitest";
import { GitHubProvider } from "../../src/git/providers/GitHubProvider";
import { GitLabProvider } from "../../src/git/providers/GitLabProvider";
import { GiteaProvider } from "../../src/git/providers/GiteaProvider";

describe("Commit Parsing Across Providers", () => {
  it("should parse GitHub commit details and calculate diff stats", async () => {
    const provider = new GitHubProvider();
    const mockCommitResponse = {
      sha: "a81f92c1234567890abcdef",
      commit: {
        message: "Update webhook handler\n\nDetailed message body",
        author: { name: "Marcel", email: "marcel@example.com", date: "2026-09-03T10:00:00Z" },
      },
      author: { login: "m5rcel", avatar_url: "https://avatar.url/123" },
      html_url: "https://github.com/m5rcel/Gitcord/commit/a81f92c1234567890abcdef",
      stats: { total: 12, additions: 1920, deletions: 500 },
      files: [
        { filename: "src/a.ts", status: "added", additions: 1000, deletions: 0 },
        { filename: "src/b.ts", status: "added", additions: 920, deletions: 0 },
        { filename: "src/c.ts", status: "removed", additions: 0, deletions: 500 },
      ],
    };

    // Spy on httpClient.get
    vi.spyOn((provider as any).httpClient, "get").mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: mockCommitResponse,
      rawText: JSON.stringify(mockCommitResponse),
    });

    const details = await provider.getCommitDetails(
      "https://github.com",
      "m5rcel",
      "Gitcord",
      "a81f92c1234567890abcdef"
    );

    expect(details).not.toBeNull();
    expect(details?.author.username).toBe("m5rcel");
    expect(details?.message).toContain("Update webhook handler");
    expect(details?.statistics.filesChanged).toBe(3);
    expect(details?.statistics.filesAdded).toBe(2);
    expect(details?.statistics.filesDeleted).toBe(1);
    expect(details?.statistics.linesAdded).toBe(1920);
    expect(details?.statistics.linesRemoved).toBe(500);
  });

  it("should parse GitLab commit and diff items", async () => {
    const provider = new GitLabProvider();
    const mockCommit = {
      id: "b1920de",
      short_id: "b1920de",
      title: "Fix API polling",
      message: "Fix API polling",
      author_name: "Marcel",
      author_email: "marcel@example.com",
      authored_date: "2026-09-02T10:00:00Z",
      web_url: "https://gitlab.com/m5rcel/Gitcord/-/commit/b1920de",
      stats: { additions: 350, deletions: 120, total: 470 },
    };

    const mockDiffs = [
      { old_path: "src/old.ts", new_path: "src/old.ts", new_file: false, renamed_file: false, deleted_file: true },
      { old_path: "src/new.ts", new_path: "src/new.ts", new_file: true, renamed_file: false, deleted_file: false },
      { old_path: "src/mod.ts", new_path: "src/mod.ts", new_file: false, renamed_file: false, deleted_file: false },
    ];

    vi.spyOn((provider as any).httpClient, "get").mockImplementation((url: string) => {
      if (url.includes("/diff")) {
        return Promise.resolve({ status: 200, headers: new Headers(), data: mockDiffs, rawText: "" });
      }
      return Promise.resolve({ status: 200, headers: new Headers(), data: mockCommit, rawText: "" });
    });

    const details = await provider.getCommitDetails(
      "https://gitlab.com",
      "m5rcel",
      "Gitcord",
      "b1920de"
    );

    expect(details).not.toBeNull();
    expect(details?.statistics.filesChanged).toBe(3);
    expect(details?.statistics.filesAdded).toBe(1);
    expect(details?.statistics.filesDeleted).toBe(1);
    expect(details?.statistics.filesModified).toBe(1);
    expect(details?.statistics.linesAdded).toBe(350);
    expect(details?.statistics.linesRemoved).toBe(120);
  });

  it("should parse Gitea commit details", async () => {
    const provider = new GiteaProvider();
    const mockGiteaCommit = {
      sha: "7af92aa",
      commit: {
        message: "Improve embeds",
        author: { name: "developer", email: "dev@example.com", date: "2026-09-01T10:00:00Z" },
      },
      author: { login: "developer", avatar_url: "https://gitea.com/avatar" },
      html_url: "https://gitea.com/repo/commit/7af92aa",
      stats: { total: 4, additions: 45, deletions: 15 },
      files: [
        { filename: "a.txt", status: "added", additions: 45, deletions: 0 },
        { filename: "b.txt", status: "removed", additions: 0, deletions: 15 },
      ],
    };

    vi.spyOn((provider as any).httpClient, "get").mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: mockGiteaCommit,
      rawText: "",
    });

    const details = await provider.getCommitDetails(
      "https://gitea.example.com",
      "owner",
      "repo",
      "7af92aa"
    );

    expect(details).not.toBeNull();
    expect(details?.author.username).toBe("developer");
    expect(details?.statistics.filesAdded).toBe(1);
    expect(details?.statistics.filesDeleted).toBe(1);
    expect(details?.statistics.linesAdded).toBe(45);
    expect(details?.statistics.linesRemoved).toBe(15);
  });
});
