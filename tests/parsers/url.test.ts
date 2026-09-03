import { describe, it, expect } from "vitest";
import { validateGitInstanceUrl, parseRepositoryInput } from "../../src/utils/url-validator";

describe("URL Validator & Parser", () => {
  it("should validate legitimate public Git instance URLs", () => {
    const gh = validateGitInstanceUrl("https://github.com");
    expect(gh.valid).toBe(true);
    expect(gh.normalized).toBe("https://github.com");

    const gl = validateGitInstanceUrl("https://gitlab.com/");
    expect(gl.valid).toBe(true);
    expect(gl.normalized).toBe("https://gitlab.com");

    const codeberg = validateGitInstanceUrl("https://codeberg.org");
    expect(codeberg.valid).toBe(true);
    expect(codeberg.normalized).toBe("https://codeberg.org");
  });

  it("should block SSRF and private IP addresses", () => {
    expect(validateGitInstanceUrl("http://localhost:3000").valid).toBe(false);
    expect(validateGitInstanceUrl("http://127.0.0.1/api").valid).toBe(false);
    expect(validateGitInstanceUrl("http://10.0.0.1").valid).toBe(false);
    expect(validateGitInstanceUrl("http://172.16.0.1").valid).toBe(false);
    expect(validateGitInstanceUrl("http://192.168.1.1").valid).toBe(false);
    expect(validateGitInstanceUrl("http://169.254.169.254").valid).toBe(false);
    expect(validateGitInstanceUrl("ftp://github.com").valid).toBe(false);
    expect(validateGitInstanceUrl("javascript:alert(1)").valid).toBe(false);
  });

  it("should parse full repository URLs", () => {
    const parsed = parseRepositoryInput("https://github.com/m5rcel/Gitcord");
    expect(parsed).not.toBeNull();
    expect(parsed?.owner).toBe("m5rcel");
    expect(parsed?.name).toBe("Gitcord");
    expect(parsed?.instanceUrl).toBe("https://github.com");
    expect(parsed?.providerHint).toBe("github");
  });

  it("should parse shorthand owner/repo", () => {
    const parsed = parseRepositoryInput("octocat/Hello-World");
    expect(parsed).not.toBeNull();
    expect(parsed?.owner).toBe("octocat");
    expect(parsed?.name).toBe("Hello-World");
    expect(parsed?.instanceUrl).toBe("https://github.com");
  });
});
