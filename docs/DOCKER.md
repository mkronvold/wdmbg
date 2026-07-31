# Docker

Baseline: [`mkronvold/techstack` ci.md](https://github.com/mkronvold/techstack/blob/main/ci.md) (image rules) and product-app layout (`infra/docker/` later).

## Phase 0

No Dockerfiles or Compose files yet. Local development uses:

```bash
corepack pnpm dev
```

## Planned shape

| Runtime | Packaging |
| --- | --- |
| `apps/api` | Multi-stage Node 26 `bookworm-slim` image |
| `apps/web` | Static build + Nginx (or Node static server) image |
| `apps/probe` | **Host binary + systemd** — not containerized in MVP |
| Postgres | Digest-pinned official image when Compose lands |

## Registry

Home profile → **GHCR** (`ghcr.io/mkronvold/wdmbg-*`).
