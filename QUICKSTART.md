# Quick start

Public path to run **WDMBG**: API + web + Postgres via Compose, a reverse proxy in front of **web**, and a host-native pcap probe on a Linux capture host.

Design background: [DESIGN.md](./DESIGN.md).  
One concrete home-lab example (hostnames, AdGuard, NPM): [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md).

> **Line endings:** scripts under `deploy/**` are **LF** (Unix). The repo sets `* text=auto eol=lf` in [`.gitattributes`](./.gitattributes). If bash errors on `$'\r'` after a Windows copy, run:
>
> ```bash
> sed -i 's/\r$//' deploy/compose/*.sh 2>/dev/null || true
> chmod +x deploy/compose/*.sh
> ```

## 1. Prerequisites

- Docker Engine + Compose plugin on the **app host**
- A reverse proxy you control (Nginx Proxy Manager, Caddy, Traefik, plain nginx, …)
- LAN DNS (or `/etc/hosts`) for a hostname that points at the app host / proxy
- A **Linux capture host** with libpcap and a suitable bridge/tap (often a hypervisor host)
- Go **1.25+** on a build machine (to cross-compile the probe)
- Outbound pull access to GHCR: `ghcr.io/mkronvold/*`
- Optional: AdGuard Home (or similar) for LAN hostname enrichment; MaxMind GeoLite2-Country for country cards

## 2. Run API + web + Postgres (Compose)

From a clone of this repo on the app host:

```bash
cp deploy/env/.env.example deploy/env/.env
cp deploy/env/api.env.example deploy/env/api.env
chmod 600 deploy/env/.env deploy/env/api.env
# edit POSTGRES_PASSWORD (and optional AdGuard / GeoIP settings)
# never commit real secrets — examples use placeholders like change-me
```

Image pins ([`deploy/compose/images.env`](./deploy/compose/images.env)):

- `ghcr.io/mkronvold/wdmbg-api:main`
- `ghcr.io/mkronvold/wdmbg-web:main`
- `postgres:16-alpine` (app-local only)

Default Compose ([`deploy/compose/compose.prod.yml`](./deploy/compose/compose.prod.yml)):

| Service | Networks | Published ports |
| --- | --- | --- |
| `postgres` | app-local only | none |
| `api` | app-local only | none |
| `web` | app-local **and** external proxy network | none |

The stock file expects an **external** Docker network named `nginxproxy_proxy-net` (typical NPM setup). Create it or attach your proxy’s network:

```bash
# only if you do not already have NPM's network
docker network create nginxproxy_proxy-net

cd deploy/compose
chmod +x up.sh down.sh autoupdate.sh
./up.sh
docker compose -f compose.prod.yml --env-file images.env ps
```

`up.sh` sources `images.env` + `../env/.env` and fails if required env or the external proxy network is missing.

**Optional proxy network:** if you prefer host ports or a different network name, copy/edit `compose.prod.yml` (publish `web:80`, or rename the external network). Keep **api** and **postgres** off the public edge; let **web** nginx proxy `/api` (and WebSocket `/api/live`) to the private API.

### Optional enrichment

- **GeoIP:** place `GeoLite2-Country.mmdb` on the app host and set `WDMBG_GEOIP_HOST_PATH` in `.env` plus `WDMBG_GEOIP_DB_PATH` in `api.env` (see [docs/ENRICHMENT.md](./docs/ENRICHMENT.md)).
- **AdGuard:** set `WDMBG_ADGUARD_URL` (and auth if needed) in `api.env` so LAN hosts resolve from rewrites/DHCP/clients before PTR.

Without GeoIP, private IPs show as **Local** and others as **Unknown**. Without AdGuard, resolve falls back to aliases + PTR.

## 3. Reverse proxy

Point your hostname at the **web** service on port **80** (HTTP is fine on a trusted LAN).

| Proxy target | Value |
| --- | --- |
| Upstream | Docker DNS name `web` (or container name on the shared proxy network) |
| Port | `80` |
| TLS | Optional; many home labs run plain HTTP on `.lan` |
| Websockets | **On** (required for `/api/live`) |

**Web already reverse-proxies:**

- `/api/*` → private `api:4080` (including WebSocket `/api/live`)

Browsers and the probe should use the **same front-door hostname** so paths stay consistent:

| Client | URL |
| --- | --- |
| Dashboard | `http://<host>/` |
| Health | `http://<host>/api/health` |
| Dashboard API | `http://<host>/api/dashboard?window=30s` |
| Probe ingest | `http://<host>/api/ingest/rollups` |
| Live WS | `ws://<host>/api/live` |

Example (Nginx Proxy Manager): domain → scheme `http`, forward hostname `web`, forward port `80`, websockets **on**, SSL off unless you terminate TLS at the proxy.

## 4. DNS notes

- Create a LAN record (AdGuard / Pi-hole / router DNS / hosts file) from your chosen name to the **app host** (or the host that runs the reverse proxy).
- Prefer a **dedicated** name (for example `wdmbg.example` / `wdmbg.lan` or your own domain).
- Ensure the **probe host** can resolve that name (or use a stable IP in `WDMBG_API_INGEST_URL`).

## 5. Build and install the probe

The probe is **host-native** (not containerized). It must run on a machine that can see the traffic you care about (typically a Linux bridge or tap on a hypervisor host).

### Cross-compile

```bash
cd apps/probe
go test ./...

# typical x86_64 Linux capture host
GOOS=linux GOARCH=amd64 go build -o wdmbg-probe .

# 64-bit ARM hosts
GOOS=linux GOARCH=arm64 go build -o wdmbg-probe .
```

Real capture builds on Linux need **libpcap** (`libpcap-dev` / equivalent) and usually `CAP_NET_RAW` or root.

### Install (systemd sketch)

Stubs live in [`deploy/proxbox1/`](./deploy/proxbox1/) (unit + env example). Adjust hostnames and paths for your lab:

```bash
scp wdmbg-probe <capture-host>:/usr/local/bin/wdmbg-probe
ssh <capture-host> 'chmod 755 /usr/local/bin/wdmbg-probe'

scp deploy/proxbox1/wdmbg-probe.service <capture-host>:/etc/systemd/system/
ssh <capture-host> 'mkdir -p /etc/wdmbg && chmod 700 /etc/wdmbg'
scp deploy/proxbox1/wdmbg-probe.env.example <capture-host>:/etc/wdmbg/probe.env
ssh <capture-host> 'chmod 600 /etc/wdmbg/probe.env'
# edit WDMBG_CAPTURE_IFACE and WDMBG_API_INGEST_URL before enable
```

Set ingest to your front door (not a raw API container port unless you published one):

```text
WDMBG_API_INGEST_URL=http://<host>/api/ingest/rollups
WDMBG_CAPTURE_IFACE=vmbr0   # or the correct bridge/tap
WDMBG_PROBE_ID=probe-1
WDMBG_BATCH_INTERVAL_SEC=1
```

```bash
ssh <capture-host> 'systemctl daemon-reload'
# Smoke first:
# ssh <capture-host> '/usr/local/bin/wdmbg-probe -simulate -once'
# Enable only after iface + ingest smoke succeed:
# ssh <capture-host> 'systemctl enable --now wdmbg-probe'
```

More detail: [docs/PROBE.md](./docs/PROBE.md) and [`deploy/proxbox1/README.md`](./deploy/proxbox1/README.md).

**Do not** `enable --now` until simulate (or a careful live) smoke against ingest succeeds.

## 6. Smoke checks

```bash
curl -sS http://<host>/api/health
curl -sS 'http://<host>/api/dashboard?window=30s'
```

Expect health JSON quickly; dashboard may show empty tables until the probe posts.

After the probe is up:

```bash
# on the capture host
journalctl -u wdmbg-probe -f
```

Re-check `/api/dashboard`, then open `http://<host>/` in a browser.

Optional Playwright smoke against a live deploy: see [apps/e2e/README.md](./apps/e2e/README.md).

## 7. Local dev with `-simulate`

No capture hardware required:

```bash
corepack enable && pnpm install

pnpm --filter @wdmbg/api dev          # :4080
pnpm --filter @wdmbg/web dev          # :5173

cd apps/probe
go run . -simulate -ingest-url http://127.0.0.1:4080/api/ingest/rollups
```

UI: http://127.0.0.1:5173/

One-shot:

```bash
go run . -simulate -once -ingest-url http://127.0.0.1:4080/api/ingest/rollups
```

Full monorepo: `pnpm dev` then the same probe command. Validate: `pnpm validate` and `cd apps/probe && go test ./...`.

## Optional: pull newer `:main` images

```bash
cd deploy/compose
./autoupdate.sh --once
```

## Next

- Architecture and non-goals → [DESIGN.md](./DESIGN.md)
- Lab-specific hostnames and checklist → [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md)
- Repo overview → [README.md](./README.md)
