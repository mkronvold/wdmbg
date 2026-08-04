# WDMBG — Where did my bandwidth go?

[![Validate](https://github.com/mkronvold/wdmbg/actions/workflows/validate.yml/badge.svg)](https://github.com/mkronvold/wdmbg/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Passive LAN traffic monitor** — live top talkers/receivers, bulk flows, protocols, and host detail over short sliding windows.

This project answers "who is using the network _right now_?" from a pcap probe on a Linux bridge or tap. It is **independent of** Speedify, ntop, NetFlow/sFlow exporters, and other WAN-health or long-term accounting stacks.

| Doc | Audience |
| --- | --- |
| **[QUICKSTART.md](./QUICKSTART.md)** | Public install path (compose + reverse proxy + probe) |
| **[DESIGN.md](./DESIGN.md)** | Goals, data plane, trust model, roadmap |
| **[docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md)** | One home-lab reference (optional detail) |
| **[docs/](./docs/)** | Ops notes (Docker, probe, enrichment, CI, LCM) |

License: [MIT](./LICENSE)

## What you get

- **Traffic summary** — Local vs Internet byte totals for the selected window
- **Top talkers / top receivers** (plus optional Local-only talker/receiver cards)
- **Bulk flows** — hottest bidirectional flows in the window
- **Top protocols** (port / L4 heuristics) and **top countries** (optional GeoIP)
- **Host dialog** — per-host summary, peers, flows; persistent **aliases**
- **Resolve names** — auto resolve via alias → AdGuard (optional) → PTR
- Query **windows**: `5s` · `30s` · `5m` · `15m` · `30m` · `1h`
- Display refresh controls (pause / 1s / 5s / …), card reorder/hide, **wide** cards
- User-added **URL cards** (iframe + pop-out) for sibling dashboards
- Live WebSocket hint path (`/api/live`) behind the web proxy

## Architecture

```text
Capture host                         App host (Docker)
┌──────────────────────────┐          ┌──────────────────────────────┐
│ Go probe (host-native)   │  POST    │ Fastify API                  │
│  pcap on bridge/tap      │ ───────▶ │  in-memory 1s ring (~1h)     │
│  1s flow rollups         │ /api/    │  Postgres (aliases / cache)  │
│                          │ ingest   │ React web (static + nginx)   │
│                          │ /rollups │  proxies /api (+ WS)         │
└──────────────────────────┘          └──────────────────────────────┘
```

1. **Probe** captures on a Linux interface, builds 1-second bidirectional flow buckets, and POSTs JSON rollups.
2. **API** keeps ~1 hour of 1s buckets in an in-memory ring; Postgres holds aliases and lookup cache only.
3. **Web UI** loads `/api/dashboard?window=…` (and host endpoints) via same-origin proxy.

## Stack

| Piece | Tech |
| --- | --- |
| Monorepo | **pnpm** + **Turbo** |
| Runtime | **Node 26** |
| Probe | **Go** host binary + libpcap (`apps/probe`) |
| API | **Fastify** + TypeScript (`apps/api`) |
| Web | **React 19** + Vite (`apps/web`) |
| Meta DB | **Postgres** (aliases, lookup_cache, settings) |
| Contracts | Shared Zod schemas (`packages/contracts`) |

## GHCR images

Published from `main`:

- `ghcr.io/mkronvold/wdmbg-api:main`
- `ghcr.io/mkronvold/wdmbg-web:main`

Pins live in [`deploy/compose/images.env`](./deploy/compose/images.env). Postgres uses the official image on the app-local network only. The probe is **not** containerized in MVP.

## Quick links

- **Production-style bring-up:** [QUICKSTART.md](./QUICKSTART.md)
- **Design / non-goals:** [DESIGN.md](./DESIGN.md)
- **Compose:** [`deploy/compose/`](./deploy/compose/)
- **Probe install (systemd):** [`deploy/proxbox1/`](./deploy/proxbox1/)
- **Enrichment (AdGuard / PTR / GeoIP):** [docs/ENRICHMENT.md](./docs/ENRICHMENT.md)

## Local development (simulate)

Requirements: **Node 26**, corepack / **pnpm 10**, **Go 1.25+** (probe). libpcap only needed for real capture builds.

```bash
corepack enable
pnpm install
pnpm validate   # lint, typecheck, test, build, format
```

```bash
# terminal 1 — full monorepo dev (API :4080, web :5173)
pnpm dev

# or split:
pnpm --filter @wdmbg/api dev
pnpm --filter @wdmbg/web dev

# terminal — simulated probe → local API
cd apps/probe
go test ./...
go run . -simulate -once -ingest-url http://127.0.0.1:4080/api/ingest/rollups
# continuous:
go run . -simulate -ingest-url http://127.0.0.1:4080/api/ingest/rollups
```

- Web: http://127.0.0.1:5173/
- API health: http://127.0.0.1:4080/health
- Dashboard API: http://127.0.0.1:4080/api/dashboard?window=30s

## API surface

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health`, `/api/health` | Liveness + GeoIP status |
| `POST` | `/api/ingest/rollups` | Probe rollup batches |
| `GET` | `/api/dashboard?window=30s` | Talkers, flows, protocols, … |
| `GET` | `/api/hosts/:host` | Per-host summary |
| `GET` | `/api/hosts/:host/flows` | Per-host flows |
| `PUT` / `DELETE` | `/api/alias` | Host aliases |
| `GET` | `/api/aliases` | List aliases |
| `POST` | `/api/resolve` | Batch hostname resolve |
| `GET` | `/api/live` | WebSocket live channel |

Optional query flag: `excludeLocal=1` on dashboard/host routes.

## Repository layout

| Path | Role |
| --- | --- |
| `apps/probe` | Host-native Go pcap probe |
| `apps/api` | Fastify ingest + query + meta |
| `apps/web` | React dashboard |
| `apps/e2e` | Playwright live smoke |
| `packages/contracts` | Shared Zod schemas |
| `packages/config` | Defaults / env helpers |
| `deploy/compose` | api + web + postgres Compose |
| `deploy/proxbox1` | Probe systemd unit + env example |
| `docs/` | Ops and home-lab runbooks |

## CI

- **Validate** — pnpm lint / typecheck / test / build / format + Go probe tests
- **Images** — build and push api + web to GHCR on `main`

## Themes

Dashboard colors come from the shared [`mkronvold/themes`](https://github.com/mkronvold/themes)
token set. Because `@mkronvold/themes` is not published to npm, `theme.css` is **vendored** at
[`apps/web/src/styles/theme.css`](apps/web/src/styles/theme.css) (with upstream attribution).
