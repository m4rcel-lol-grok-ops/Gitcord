# Multi-stage Dockerfile for Gitcord
# Stage 1: Build TypeScript application and compile native addons
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build essentials for native module compilation (better-sqlite3)
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
RUN npm prune --omit=dev

# Stage 2: Production runtime
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/gitcord.sqlite

# Copy built application, production node_modules (with compiled native addon), and migrations
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY migrations/ ./migrations/

# Ensure data directory exists
RUN mkdir -p /app/data

VOLUME ["/app/data"]

# Run node directly so SIGTERM/SIGINT are received cleanly
CMD ["node", "dist/index.js"]
