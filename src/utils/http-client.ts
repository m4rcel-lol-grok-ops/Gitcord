import { logger } from "./logger";

export interface HttpClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  maxResponseBytes?: number;
  headers?: Record<string, string>;
  token?: string;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
  rawText: string;
}

function waitDelay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export class HttpClient {
  private timeoutMs: number;
  private maxRetries: number;
  private maxResponseBytes: number;
  private defaultHeaders: Record<string, string>;
  private rateLimitResetMap: Map<string, number> = new Map();

  constructor(options: HttpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.maxRetries = options.maxRetries ?? 3;
    this.maxResponseBytes = options.maxResponseBytes ?? 5 * 1024 * 1024; // 5 MB
    this.defaultHeaders = {
      "User-Agent": "Gitcord/1.0.0 (+https://github.com/gitcord)",
      Accept: "application/json",
      ...(options.headers || {}),
    };
    if (options.token) {
      this.defaultHeaders["Authorization"] = options.token.startsWith("token ") || options.token.startsWith("Bearer ")
        ? options.token
        : `Bearer ${options.token}`;
    }
  }

  async get<T = unknown>(url: string, customHeaders: Record<string, string> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, { method: "GET", headers: customHeaders });
  }

  async request<T = unknown>(
    url: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {}
  ): Promise<HttpResponse<T>> {
    let attempt = 0;
    const delay = 1000;

    const host = new URL(url).host;

    while (attempt <= this.maxRetries) {
      attempt++;

      // Check client-side rate limit reset timer
      const resetTime = this.rateLimitResetMap.get(host);
      if (resetTime && resetTime > Date.now()) {
        const waitMs = Math.min(resetTime - Date.now(), 10000);
        logger.warn(`Rate limit active for ${host}. Waiting ${waitMs}ms before request.`);
        await waitDelay(waitMs);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers: Record<string, string> = {
          ...this.defaultHeaders,
          ...(options.headers || {}),
        };

        const response = await fetch(url, {
          method: options.method || "GET",
          headers,
          body: options.body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Check for 429 Too Many Requests
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 0;
          const waitTime = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : delay * Math.pow(2, attempt);
          this.rateLimitResetMap.set(host, Date.now() + waitTime);

          logger.warn(`Received HTTP 429 from ${host}. Retry after ${waitTime}ms. (Attempt ${attempt}/${this.maxRetries})`);

          if (attempt <= this.maxRetries) {
            await waitDelay(waitTime);
            continue;
          }
        }

        // Check provider rate limit headers (GitHub/GitLab)
        const remaining = response.headers.get("x-ratelimit-remaining");
        const reset = response.headers.get("x-ratelimit-reset");
        if (remaining === "0" && reset) {
          const resetTs = parseInt(reset, 10) * 1000;
          if (Number.isFinite(resetTs)) {
            this.rateLimitResetMap.set(host, resetTs);
          }
        }

        // Response size safety guard
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > this.maxResponseBytes) {
          throw new Error(`Response size exceeds limit of ${this.maxResponseBytes} bytes`);
        }

        const rawText = await response.text();
        if (rawText.length > this.maxResponseBytes) {
          throw new Error(`Response body exceeds limit of ${this.maxResponseBytes} bytes`);
        }

        let parsedData: T;
        try {
          parsedData = rawText.length > 0 ? (JSON.parse(rawText) as T) : ({} as T);
        } catch {
          parsedData = rawText as unknown as T;
        }

        return {
          status: response.status,
          headers: response.headers,
          data: parsedData,
          rawText,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const errMsg = (err as Error)?.message || "";
        if (errMsg.includes("Response size exceeds limit")) {
          throw err;
        }

        const isAbort = (err as Error)?.name === "AbortError";
        const isNetworkErr = !isAbort && attempt <= this.maxRetries;

        if (isNetworkErr) {
          const backoff = delay * Math.pow(2, attempt - 1);
          logger.warn(`Request to ${host} failed: ${(err as Error).message}. Retrying in ${backoff}ms...`);
          await waitDelay(backoff);
          continue;
        }

        throw new Error(`HTTP request failed for ${host}: ${isAbort ? "Request timed out" : (err as Error).message}`);
      }
    }

    throw new Error(`Max retries reached for request to ${host}`);
  }
}
