# Investoyard web — production image (build from the REPO ROOT):
#   docker build -f apps/web/Dockerfile -t investoyard-web .
#
# Next.js static export served by nginx, which also proxies /api → the api
# container (single origin: no CORS, and the tenant Host header flows through).

# ---------------------------------------------------------------- build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Baked into the client bundle at build time. "/api" = same-origin via the nginx proxy.
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json turbo.json ./
COPY scripts ./scripts
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/rail-adapters/package.json packages/rail-adapters/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/i18n/package.json packages/i18n/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/

RUN npm ci -w @investoyard/web --include-workspace-root --ignore-scripts

COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build -w @investoyard/shared-types -w @investoyard/design-tokens -w @investoyard/i18n \
 && npm run build -w @investoyard/web

# ---------------------------------------------------------------- runtime stage
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/out /usr/share/nginx/html
EXPOSE 80
