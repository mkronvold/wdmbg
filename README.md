# WDMBG — Where did my bandwidth go?

Lightweight **passive traffic monitor** for a home / LAN lab:

- **Go probe** on Proxmox (host-native + systemd)
- **Fastify API** (TypeScript) for ingest and metadata
- **React dashboard** for live and historical views

This repository follows the product-app profile from
[`mkronvold/techstack`](https://github.com/mkronvold/techstack).

## Status

**Phase 0 scaffold** — monorepo layout, health endpoint, web shell, shared packages,
Go probe stub, CI validate skeleton. No capture pipeline yet.

## MVP decisions (locked)

| Topic | Decision |
| --- | --- |
| Worker | None in MVP |
| Auth | None (LAN-trusted) |
| Live traffic | 15-minute **in-memory** buffer in the API (not durable) |
| Probe → API | HTTP `POST` JSON batches |
| Probe runtime | Go, host-native + systemd only (not containerized in MVP) |
| Metadata store | Postgres + `pg` (dependency/scaffold only in Phase 0) |
| L7 | Ports + DNS correlation later; nDPI deferred |
| Registry | Home profile — GHCR (`ghcr.io/mkronvold/...`) |

## Workspace layout

```
apps/api          Fastify + TypeScript API
apps/web          React 19 + Vite dashboard shell
apps/probe        Go probe module (skeleton)
packages/contracts  Shared Zod schemas
packages/config     Shared env / defaults
docs/             Thin ops docs (deltas vs techstack)
```

## Prerequisites

- Node **26** (see `.node-version` / `engines`)
- [Corepack](https://nodejs.org/api/corepack.html) + **pnpm@10.x**
- Go **1.25+** (for `apps/probe`)

## Quick start

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

- Web: http://localhost:5173  
- API health: http://localhost:4080/health  

Probe stub:

```bash
cd apps/probe
go run . -version
go run . -help
```

## Validate

Same gate CI runs:

```bash
corepack pnpm validate
# or stepwise:
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
```

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/CI.md](docs/CI.md) | Validation / future publish |
| [docs/LCM.md](docs/LCM.md) | Lifecycle / GHCR home profile |
| [docs/DOCKER.md](docs/DOCKER.md) | Container notes (API/web later; probe host-native) |
| [docs/GITHUB-SETUP.md](docs/GITHUB-SETUP.md) | Repo settings checklist |
| [docs/PROBE.md](docs/PROBE.md) | Go probe delta + systemd intent |
| [security/exceptions.md](security/exceptions.md) | Temporary baseline exceptions |

Baseline policy lives in the techstack repo; these docs only list **WDMBG deltas**.

## Themes

`@mkronvold/themes` is not wired yet (not installable in this scaffold). The web app
uses interim CSS variables — see `security/exceptions.md`.
