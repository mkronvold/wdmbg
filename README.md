# WDMBG — Where did my bandwidth go?

Lightweight **passive traffic monitor** for a home / LAN lab:

- **Go probe** on Proxmox (host-native + systemd)
- **Fastify API** (TypeScript) for ingest, query, and metadata
- **React dashboard** for live sliding windows

This repository follows the product-app profile from
[`mkronvold/techstack`](https://github.com/mkronvold/techstack).

## Status

**MVP Phases 1–6** — contracts + ingest ring, Go probe, query API + live WS, dashboard UI,
Postgres metadata + enrichment hooks, home compose/deploy docs.

## MVP decisions (locked)

| Topic | Decision |
| --- | --- |
| Worker | None in MVP |
| Auth | None (LAN-trusted) |
| Live traffic | 15-minute **in-memory** 1s buckets in the API |
| Windows | `5s` \| `30s` \| `5m` |
| Probe → API | HTTP `POST` JSON rollups → `/api/ingest/rollups` |
| Probe runtime | Go, host-native + systemd only (not containerized) |
| Metadata store | Postgres + `pg` (aliases, lookup_cache, settings) |
| L7 | Port heuristics; nDPI deferred |
| Registry | Home profile — GHCR (`ghcr.io/mkronvold/...`) |
| App host | `docker.lan` (`10.0.0.202`) → `~/src/wdmbg`, NPM + `wdmbg.lan` |
| Probe host | `proxbox1` / `proxmox1` (`10.0.0.193`) host-native + systemd |

## Workspace layout

```
apps/api          Fastify + TypeScript API
apps/web          React 19 + Vite dashboard
apps/probe        Go probe (pcap linux + simulate)
packages/contracts  Shared Zod schemas
packages/config     Shared env / defaults
deploy/compose    compose.prod.yml, up.sh/down.sh, images.env
deploy/proxbox1   systemd unit + env examples
docs/             Ops docs (deltas vs techstack)
```

## Prerequisites

- Node **26** (see `.node-version` / `engines`)
- [Corepack](https://nodejs.org/api/corepack.html) + **pnpm@10.x**
- Go **1.25+** (for `apps/probe`)
- libpcap (Linux capture builds only)

## Quick start

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

- Web: http://localhost:5173  
- API health: http://localhost:4080/health  
- Dashboard API: http://localhost:4080/api/dashboard?window=30s  

Probe simulate:

```bash
cd apps/probe
go test ./...
go run . -simulate -once -ingest-url http://127.0.0.1:4080/api/ingest/rollups
```

## Validate

```bash
corepack pnpm validate
cd apps/probe && go test ./...
```

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/CI.md](docs/CI.md) | Validation / publish |
| [docs/LCM.md](docs/LCM.md) | Lifecycle / GHCR home profile |
| [docs/DOCKER.md](docs/DOCKER.md) | Compose topology |
| [docs/DEPLOY-HOME.md](docs/DEPLOY-HOME.md) | docker.lan + proxbox1 runbook |
| [docs/PROBE.md](docs/PROBE.md) | Go probe |
| [docs/ENRICHMENT.md](docs/ENRICHMENT.md) | PTR / GeoIP / country rules |
| [docs/GITHUB-SETUP.md](docs/GITHUB-SETUP.md) | Repo settings checklist |
| [security/exceptions.md](security/exceptions.md) | Temporary baseline exceptions |

## Themes

`@mkronvold/themes` is not wired yet. The web app uses interim CSS variables —
see `security/exceptions.md`.