# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS base
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN corepack pnpm install --frozen-lockfile --filter @wdmbg/web...

FROM base AS build
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN corepack pnpm --filter @wdmbg/contracts build \
  && corepack pnpm --filter @wdmbg/web build

FROM nginx:1.28-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1