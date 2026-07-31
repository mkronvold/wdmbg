# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS base
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN corepack pnpm install --frozen-lockfile --filter @wdmbg/api...

FROM base AS build
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN corepack pnpm --filter @wdmbg/contracts build \
  && corepack pnpm --filter @wdmbg/config build \
  && corepack pnpm --filter @wdmbg/api build \
  && corepack pnpm --filter @wdmbg/api deploy --prod --legacy /out

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --uid 10001 --create-home wdmbg
COPY --from=build /out/ ./
USER wdmbg
EXPOSE 4080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]