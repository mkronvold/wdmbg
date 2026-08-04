# Docker

> Public install path: [QUICKSTART.md](../QUICKSTART.md) · design: [DESIGN.md](../DESIGN.md).

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
Compose: `deploy/compose/compose.prod.yml` + `images.env` + `up.sh` / `down.sh` / `autoupdate.sh`.

## Compose topology (docker.lan)

App directory: `~/src/wdmbg` on `user@docker.lan`.

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
| DNS | AdGuard rewrite `wdmbg.lan` → `docker.lan` |

## Helpers

`deploy/compose/up.sh` / `down.sh` / `autoupdate.sh` follow updown conventions:

- `set -euo pipefail`, cd to script dir, timestamped logs (`up` / `down`)
- `up.sh`: source `images.env` + `../env/.env`, `docker compose pull` then `up -d "$@"`
- `down.sh`: `docker compose down "$@"` (no `--volumes` by default)
- `autoupdate.sh`: GHCR digest watcher for **api** and **web** only (not postgres)

```bash
cd ~/src/wdmbg/deploy/compose
./up.sh
./down.sh
./autoupdate.sh --once
./autoupdate.sh 30   # interactive loop; prefer --once under cron/timer
```

`autoupdate.sh` compares local image digests to remote GHCR manifests, pulls only
when `api`/`web` change, and restarts through `./up.sh`. Uses a lock file so
cycles cannot overlap. Relies on existing `docker login ghcr.io` on the host
(or `GHCR_USERNAME` / `GHCR_TOKEN` in the environment — never log tokens).

### Install auto-refresh on docker.lan

Prefer a systemd user/system timer or crontab running `--once` about every 30 minutes
**after** the stack is deployed under `~/src/wdmbg`.

Cron example:

```cron
*/30 * * * * cd /home/mkronvold/src/wdmbg/deploy/compose && /bin/bash ./autoupdate.sh --once >> ./autoupdate.log 2>&1
```

Systemd timer example (system units under `/etc/systemd/system/`):

```ini
# /etc/systemd/system/wdmbg-autoupdate.service
[Unit]
Description=WDMBG GHCR autoupdate (once)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=mkronvold
WorkingDirectory=/home/mkronvold/src/wdmbg/deploy/compose
ExecStart=/bin/bash ./autoupdate.sh --once
```

```ini
# /etc/systemd/system/wdmbg-autoupdate.timer
[Unit]
Description=Run WDMBG GHCR autoupdate every 30 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=30min
Unit=wdmbg-autoupdate.service

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now wdmbg-autoupdate.timer
systemctl list-timers | grep wdmbg
```

### Autostart after reboot

Compose services use `restart: unless-stopped`. Ensure Docker itself starts on boot
(`systemctl is-enabled docker` → `enabled`). No extra unit is required for the stack
once containers have been started once with `./up.sh`.

## Registry

Home profile → **GHCR** (`ghcr.io/mkronvold/wdmbg-*`). CI skeleton: `.github/workflows/images.yml`.