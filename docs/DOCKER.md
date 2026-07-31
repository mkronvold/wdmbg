# Docker

Baseline: [`mkronvold/techstack` ci.md](https://github.com/mkronvold/techstack/blob/main/ci.md) (image rules).  
Home host layout: [DEPLOY-HOME.md](./DEPLOY-HOME.md)  
Probe is **not** containerized: [PROBE.md](./PROBE.md)

## Phase 0

No Dockerfiles or Compose files yet. Local development uses:

```bash
corepack pnpm dev
```

## Planned images (GHCR, home profile)

| Runtime | Packaging |
| --- | --- |
| `apps/api` | Multi-stage Node 26 `bookworm-slim` → `ghcr.io/mkronvold/wdmbg-api` |
| `apps/web` | Static build + reverse-proxy-capable front → `ghcr.io/mkronvold/wdmbg-web` |
| `apps/probe` | **Host binary + systemd** on proxbox1 — not an image in MVP |
| Postgres | Digest-pinned official image on the app-local network |

## Planned Compose topology (docker.lan)

App directory: `~/src/wdmbg` on `mkronvold@docker.lan` (`10.0.0.202`).

```text
                    nginxproxy_proxy-net
                           │
                     ┌─────▼─────┐
   wdmbg.lan ───────►│    web    │  (only service on proxy-net)
                     └─────┬─────┘
                           │  /api , /api/live (ws)
                     ┌─────▼─────┐
                     │    api    │──── app network only
                     └─────┬─────┘
                           │
                     ┌─────▼─────┐
                     │ postgres  │──── app network only
                     └───────────┘
```

| Rule | Detail |
| --- | --- |
| Proxy network | External `nginxproxy_proxy-net` |
| On proxy-net | **web only** (service alias for NPM) |
| App network | `web`, `api`, `postgres` |
| Host ports | **None** published |
| Web duties | Serve UI; reverse-proxy `/api` and WebSocket `/api/live` to `api` |
| NPM | `wdmbg.lan` → web container alias:port, HTTP, no public TLS |
| DNS | AdGuard rewrite `wdmbg.lan` → `10.0.0.202` |

## Helpers (later)

When Compose lands, add `up.sh` / `down.sh` per WSL `~/.promptlib/updown.md`:

- `set -euo pipefail`, cd to script dir, timestamped logs
- `up.sh`: `docker compose pull` then `up -d "$@"`
- `down.sh`: `docker compose down "$@"` (no `--volumes` by default)

## Registry

Home profile → **GHCR** (`ghcr.io/mkronvold/wdmbg-*`).
