import { describe, it, expect } from "vitest";
import { resolveDatabasePath } from "../../src/database";

describe("Database URL Resolution & Normalization", () => {
  it("should strip sqlite:// and file:// prefixes", () => {
    expect(resolveDatabasePath("sqlite:///app/data/gitcord.sqlite")).toBe("/app/data/gitcord.sqlite");
    expect(resolveDatabasePath("sqlite://./data/gitcord.sqlite")).toBe("./data/gitcord.sqlite");
    expect(resolveDatabasePath("sqlite:./data/gitcord.sqlite")).toBe("./data/gitcord.sqlite");
    expect(resolveDatabasePath("file:./data/gitcord.sqlite")).toBe("./data/gitcord.sqlite");
    expect(resolveDatabasePath("file:///var/gitcord.sqlite")).toBe("/var/gitcord.sqlite");
  });

  it("should handle legacy PostgreSQL connection strings by falling back to SQLite", () => {
    const fallback = resolveDatabasePath("postgresql://postgres:password@localhost:5432/gitcord");
    expect(fallback).toMatch(/gitcord\.sqlite$/);

    const fallback2 = resolveDatabasePath("postgres://user:pass@db.internal:5432/mydb");
    expect(fallback2).toMatch(/gitcord\.sqlite$/);
  });

  it("should handle empty or whitespace values with default path", () => {
    expect(resolveDatabasePath("")).toMatch(/gitcord\.sqlite$/);
    expect(resolveDatabasePath("   ")).toMatch(/gitcord\.sqlite$/);
    expect(resolveDatabasePath(undefined)).toMatch(/gitcord\.sqlite$/);
  });

  it("should preserve :memory: identifier", () => {
    expect(resolveDatabasePath(":memory:")).toBe(":memory:");
  });
});
