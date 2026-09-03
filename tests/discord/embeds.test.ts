import { describe, it, expect } from "vitest";
import {
  buildCommitEmbed,
  buildIssueEmbed,
  buildPullRequestEmbed,
  buildRepositoryEmbed,
  buildUserEmbed,
  buildHistoryEmbed,
  buildOnboardingEmbed,
} from "../../src/discord/embeds";
import { CommitEvent, IssueEvent, PullRequestEvent, GitRepository, GitUser } from "../../src/git/models";
import { ProviderBrandInfo } from "../../src/git/providers/GitProvider";

const mockBrand: ProviderBrandInfo = {
  name: "GitHub",
  iconUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  color: 0x24292e,
};

describe("Discord Embed Builders", () => {
  it("should build commit embed matching section 9 & 10 requirements", () => {
    const commitEvent: CommitEvent = {
      type: "commit",
      provider: "github",
      instance: "https://github.com",
      repository: {
        name: "Gitcord",
        owner: "m5rcel",
        url: "https://github.com/m5rcel/Gitcord",
      },
      author: {
        username: "m5rcel",
        displayName: "Marcel",
        avatarUrl: "https://avatars.githubusercontent.com/u/123456",
      },
      commit: {
        id: "a81f92c1234567890abcdef",
        shortId: "a81f92c",
        message: "Update webhook handler",
        url: "https://github.com/m5rcel/Gitcord/commit/a81f92c",
        date: "2026-09-03T12:00:00Z",
      },
      statistics: {
        filesChanged: 12,
        filesAdded: 8,
        filesDeleted: 4,
        linesAdded: 1920,
        linesRemoved: 500,
      },
    };

    const embed = buildCommitEmbed(commitEvent, mockBrand);
    const data = embed.toJSON();

    expect(data.title).toBe("m5rcel/Gitcord");
    expect(data.description).toContain("From: GitHub");
    expect(data.description).toContain("Files changed:** 12");
    expect(data.description).toContain("Added:** 8");
    expect(data.description).toContain("Removed:** 4");
    expect(data.description).toContain("+ 1,920");
    expect(data.description).toContain("- 500");
    expect(data.description).toContain("Update webhook handler");
    expect(data.thumbnail?.url).toBe("https://avatars.githubusercontent.com/u/123456");
    expect(data.color).toBe(0x24292e);
    expect(data.footer?.text).toContain("GitHub Commit");
  });

  it("should handle commit embed with unavailable statistics without fabricating numbers", () => {
    const commitEvent: CommitEvent = {
      type: "commit",
      provider: "generic",
      instance: "https://git.example.com",
      repository: {
        name: "repo",
        owner: "user",
        url: "https://git.example.com/user/repo",
      },
      author: {
        username: "user",
      },
      commit: {
        id: "1234567",
        shortId: "1234567",
        message: "Initial commit",
        url: "https://git.example.com/user/repo/1234567",
        date: "2026-09-03T12:00:00Z",
      },
      statistics: {
        filesChanged: 1,
        isUnavailable: true,
      },
    };

    const embed = buildCommitEmbed(commitEvent, { name: "Git", iconUrl: "https://git.icon", color: 0x123 });
    const data = embed.toJSON();

    expect(data.description).toContain("Statistics unavailable");
    expect(data.description).not.toContain("+ ");
  });

  it("should build onboarding embed with required greeting and commands", () => {
    const embed = buildOnboardingEmbed("git");
    const data = embed.toJSON();

    expect(data.title).toContain("Thanks for inviting Gitcord to your server!");
    expect(data.description).toContain("Gitcord brings Git activity directly into your Discord server");
    expect(data.fields?.some((f) => f.value.includes("/git setup"))).toBe(true);
    expect(data.fields?.some((f) => f.value.includes("git help"))).toBe(true);
  });
});
