# Multi-stage Dockerfile for Gitcord
# Stage 1: Build TypeScript application
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build essentials for native modules (e.g., better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY migrations/ ./migrations/
RUN npm run build

# Stage 2: Production runtime
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/gitcord.sqlite

# Install runtime sqlite3 library / build tool if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove build tools after native module compilation to keep image clean
RUN apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY migrations/ ./migrations/

# Ensure data directory exists and has correct permissions
RUN mkdir -p /app/data

VOLUME ["/app/data"]

# Run node directly so SIGTERM/SIGINT are received cleanly
CMD ["node", "dist/index.js"]
