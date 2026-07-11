# Investoyard API — production image (build from the REPO ROOT):
#   docker build -f apps/api/Dockerfile -t investoyard-api .
#
# Multi-stage: install only the api workspace's dependency tree, build the shared
# packages + the Nest app, then ship dist + node_modules. Debian-slim (not alpine)
# so Prisma's engines work without musl quirks.

# ---------------------------------------------------------------- build stage
FROM node:22-bookworm-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Manifests first (layer-cached installs). All workspace package.jsons must be
# present for npm to validate the workspace tree against the lockfile.
COPY package.json package-lock.json turbo.json ./
COPY scripts ./scripts
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/rail-adapters/package.json packages/rail-adapters/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/i18n/package.json packages/i18n/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/

# Only the api workspace's tree (skips expo/react-native etc.). --ignore-scripts
# skips the expo-router link postinstall (mobile isn't installed here); prisma
# engines are fetched by `prisma generate` below.
RUN npm ci -w @investoyard/api --include-workspace-root --ignore-scripts

# Sources + build (rail-adapters first — the api's only workspace dep; the prisma
# client is generated into the root node_modules by the api build).
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run build -w @investoyard/rail-adapters \
 && npm run build -w @investoyard/api

# ---------------------------------------------------------------- runtime stage
FROM node:22-bookworm-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

# node_modules contains the workspace symlinks into ./packages — copy both.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
# prisma schema + seed + RLS script: needed for `prisma db push` / `db seed` at deploy time.
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 3000
# Container healthcheck hits the public liveness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
