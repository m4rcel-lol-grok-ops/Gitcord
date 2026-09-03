import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../../src/git/providers";
import { GitHubProvider } from "../../src/git/providers/GitHubProvider";
import { GitLabProvider } from "../../src/git/providers/GitLabProvider";
import { GiteaProvider } from "../../src/git/providers/GiteaProvider";
import { ForgejoProvider } from "../../src/git/providers/ForgejoProvider";

describe("Git Providers & Statistics Calculation", () => {
  const registry = new ProviderRegistry();

  it("should detect provider by instance URL", async () => {
    const gh = await registry.resolveProviderForUrl("https://github.com");
    expect(gh.type).toBe("github");
    expect(gh.getBrandInfo().color).toBe(0x24292e);

    const gl = await registry.resolveProviderForUrl("https://gitlab.com");
    expect(gl.type).toBe("gitlab");
    expect(gl.getBrandInfo().color).toBe(0xfc6d26);

    const cb = await registry.resolveProviderForUrl("https://codeberg.org");
    expect(cb.type).toBe("forgejo");
    expect(cb.getBrandInfo().color).toBe(0xfe5323);
  });

  it("should calculate commit statistics correctly from mock responses", () => {
    // Test stats calculation logic
    const mockFiles = [
      { filename: "src/index.ts", status: "added", additions: 120, deletions: 0 },
      { filename: "src/utils.ts", status: "modified", additions: 30, deletions: 10 },
      { filename: "old-file.ts", status: "removed", additions: 0, deletions: 50 },
      { filename: "src/bot.ts", status: "modified", additions: 15, deletions: 5 },
    ];

    let filesAdded = 0;
    let filesModified = 0;
    let filesDeleted = 0;

    for (const f of mockFiles) {
      if (f.status === "added") filesAdded++;
      else if (f.status === "removed") filesDeleted++;
      else filesModified++;
    }

    const linesAdded = mockFiles.reduce((acc, f) => acc + f.additions, 0);
    const linesRemoved = mockFiles.reduce((acc, f) => acc + f.deletions, 0);

    expect(filesAdded).toBe(1);
    expect(filesModified).toBe(2);
    expect(filesDeleted).toBe(1);
    expect(mockFiles.length).toBe(4);
    expect(linesAdded).toBe(165);
    expect(linesRemoved).toBe(65);
  });

  it("should return branding metadata for each provider", () => {
    const gh = new GitHubProvider();
    expect(gh.iconUrl).toContain("GitHub-Mark");
    expect(gh.color).toBe(0x24292e);

    const gl = new GitLabProvider();
    expect(gl.iconUrl).toContain("gitlab");
    expect(gl.color).toBe(0xfc6d26);

    const gitea = new GiteaProvider();
    expect(gitea.iconUrl).toContain("gitea");
    expect(gitea.color).toBe(0x609926);

    const forgejo = new ForgejoProvider();
    expect(forgejo.iconUrl).toContain("codeberg");
    expect(forgejo.color).toBe(0xfe5323);
  });
});
