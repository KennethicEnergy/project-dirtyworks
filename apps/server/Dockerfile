# Game server image (Colyseus). Build from the repository root so the workspace is visible:
#   docker build -f apps/server/Dockerfile -t dirtyworks-server .
#   docker run -p 2567:2567 -e GAME_JWT_SECRET=... -e ALLOWED_ORIGINS=https://your.site \
#     -v dirtyworks-data:/data dirtyworks-server

# ── build: install the server workspace and bundle it (shared code included) with esbuild ──
FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
# Every workspace manifest, so the lockfile matches; only the server's tree is installed, plus the
# root's dev tooling (TypeScript, Vitest types) because the build typechecks before bundling.
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @dirtyworks/server --include-workspace-root
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build --workspace @dirtyworks/server

# ── deps: runtime dependencies only (the bundle keeps them external) ──
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @dirtyworks/server --include-workspace-root=false

# ── runtime ──
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=2567 \
    DATA_DIR=/data \
    LOG_LEVEL=info
WORKDIR /app
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
# "type": "module" for the ESM bundle.
COPY apps/server/package.json ./package.json
# Saved tables ("keep for later") live here: mount a persistent volume on /data.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
# SIGTERM disposes the tables gracefully, so kept tables are saved before the process exits.
CMD ["node", "dist/index.js"]
