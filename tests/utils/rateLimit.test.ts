import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../../src/utils/http-client";

describe("HttpClient Rate Limiting & Safety", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle HTTP 429 and retry after backoff", async () => {
    const client = new HttpClient({ maxRetries: 2, timeoutMs: 1000 });

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Rate limited" }), {
            status: 429,
            headers: {
              "retry-after": "0",
              "content-type": "application/json",
            },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    global.fetch = mockFetch;

    const res = await client.get<{ success: boolean }>("https://api.github.com/rate-test");
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(callCount).toBe(2);
  });

  it("should reject responses exceeding maximum allowed bytes", async () => {
    const client = new HttpClient({ maxResponseBytes: 100 });

    const hugeBody = "X".repeat(500);
    global.fetch = vi.fn().mockResolvedValue(
      new Response(hugeBody, {
        status: 200,
        headers: { "content-length": "500" },
      })
    );

    await expect(client.get("https://api.github.com/huge")).rejects.toThrow(
      /Response size exceeds limit/
    );
  });
});
