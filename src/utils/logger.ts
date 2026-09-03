export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  provider?: string;
  instance?: string;
  repository?: string;
  guild?: string;
  event?: string;
  user?: string;
  command?: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Mask sensitive tokens/secrets from logs
export function sanitizeLogData(input: string): string {
  return input
    .replace(/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/glpat-[A-Za-z0-9_-]{20,}/g, "[REDACTED_GITLAB_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{15,}/gi, "Bearer [REDACTED_BEARER_TOKEN]")
    .replace(/(?:password|secret|token|authorization)\s*[:=]\s*['"]?[^\s'"]+['"]?/gi, "token=[REDACTED]");
}

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = "info") {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctxString = context ? Object.entries(context)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(" ") : "";

    const suffix = ctxString ? ` [${ctxString}]` : "";
    return sanitizeLogData(`[${timestamp}] [${level.toUpperCase()}] ${message}${suffix}`);
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
    }
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (this.shouldLog("error")) {
      const errContext = { ...context };
      let errStr = "";
      if (error instanceof Error) {
        errStr = ` - ${error.message}`;
        if (this.level === "debug" && error.stack) {
          errStr += `\n${error.stack}`;
        }
      } else if (error) {
        errStr = ` - ${String(error)}`;
      }
      console.error(this.formatMessage("error", `${message}${errStr}`, errContext));
    }
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || "info"
);
