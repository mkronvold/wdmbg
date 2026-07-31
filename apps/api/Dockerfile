# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS build
WORKDIR /src
ENV CI=1
# node:*-slim images no longer ship corepack on PATH; install pnpm via npm.
RUN npm install -g pnpm@10.33.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @wdmbg/api...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @wdmbg/contracts build \
  && pnpm --filter @wdmbg/config build \
  && pnpm --filter @wdmbg/api build \
  && pnpm --filter @wdmbg/api deploy --prod --legacy /out

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --gid 10001 wdmbg \
  && useradd --uid 10001 --gid wdmbg --create-home --home-dir /app --shell /usr/sbin/nologin wdmbg
COPY --from=build --chown=wdmbg:wdmbg /out/ ./
USER wdmbg
EXPOSE 4080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]