# Docker

Baseline: [`mkronvold/techstack` ci.md](https://github.com/mkronvold/techstack/blob/main/ci.md) (image rules).  
Home host layout: [DEPLOY-HOME.md](./DEPLOY-HOME.md)  
Probe is **not** containerized: [PROBE.md](./PROBE.md)

## Images (GHCR, home profile)

| Runtime | Packaging |
| --- | --- |
| `apps/api` | Multi-stage Node 26 `bookworm-slim` → `ghcr.io/mkronvold/wdmbg-api` |
| `apps/web` | Static Vite build + nginx reverse-proxy → `ghcr.io/mkronvold/wdmbg-web` |
| `apps/probe` | **Host binary + systemd** on proxbox1 — not an image in MVP |
| Postgres | Official image on the app-local network only |

Dockerfiles: `apps/api/Dockerfile`, `apps/web/Dockerfile`.  
Compose: `deploy/compose/compose.prod.yml` + `images.env` + `up.sh` / `down.sh`.

## Compose topology (docker.lan)

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
| On proxy-net | **web only** |
| App network | `web`, `api`, `postgres` |
| Host ports | **None** published |
| Web duties | Serve UI; reverse-proxy `/api` and WebSocket `/api/live` to `api` |
| NPM | `wdmbg.lan` → web container alias:port, HTTP, websockets on |
| DNS | AdGuard rewrite `wdmbg.lan` → `10.0.0.202` |

## Helpers

`deploy/compose/up.sh` / `down.sh` follow updown conventions:

- `set -euo pipefail`, cd to script dir, timestamped logs
- `up.sh`: `docker compose pull` then `up -d "$@"`
- `down.sh`: `docker compose down "$@"` (no `--volumes` by default)

## Registry

Home profile → **GHCR** (`ghcr.io/mkronvold/wdmbg-*`). CI skeleton: `.github/workflows/images.yml`.