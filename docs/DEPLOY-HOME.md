# Home deployment (docker.lan)

Baseline host rules: WSL `~/.promptlib/dockerhost-local.md`  
Compose helpers: WSL `~/.promptlib/updown.md` + repo `deploy/compose/up.sh`  
Container packaging notes: [DOCKER.md](./DOCKER.md)  
Probe host: [PROBE.md](./PROBE.md)

## Targets

| Role | Host | Access |
| --- | --- | --- |
| App stack (web, api, postgres) | `docker.lan` | SSH `user@docker.lan` |
| Probe (capture) | `proxbox1` / hostname `proxmox1` | SSH `proxbox1` (or `root@proxmox1`) |

## App directory on docker.lan

```text
~/src/wdmbg
```

Suggested layout after checkout:

```text
~/src/wdmbg/
  deploy/compose/   # compose.prod.yml, images.env, up.sh, down.sh, autoupdate.sh
  deploy/env/       # .env (secrets), api.env
```

After the stack is up, install GHCR auto-refresh (`./autoupdate.sh --once` every ~30m)
via cron or systemd timer. Details: [DOCKER.md](./DOCKER.md#install-auto-refresh-on-dockerlan).
Compose already uses `restart: unless-stopped`; keep Docker enabled on boot so the
stack returns after reboot.

## Networking (locked)

| Service | Networks | Published host ports |
| --- | --- | --- |
| `web` | app-local **and** `nginxproxy_proxy-net` | **None** |
| `api` | app-local only | **None** |
| `postgres` | app-local only | **None** |

- Shared proxy network name: **`nginxproxy_proxy-net`** (external; owned by NPM).
- Only the **web** service attaches to the proxy network.
- Web reverse-proxies `/api` and WebSocket `/api/live` to the private API container.
- No public DNS, no Let's Encrypt, no NAT/port-forward exposure.

## LAN DNS and NPM

| Item | Value |
| --- | --- |
| AdGuard rewrite | `wdmbg.lan` → `docker.lan` |
| NPM domain | `wdmbg.lan` |
| NPM scheme | `http` |
| NPM forward | Docker DNS name for **web** (compose project service `web`) port `80` |
| SSL | None / Force SSL off |
| Websockets | **On** (required for `/api/live`) |

NPM admin (internal): `http://npm.lan:81`. AdGuard UI: `http://adguard.lan`.

## Browser and probe URLs

| Client | URL |
| --- | --- |
| Dashboard | `http://wdmbg.lan/` |
| API via web proxy | `http://wdmbg.lan/api/...` |
| Health | `http://wdmbg.lan/api/health` |
| Live WS | `ws://wdmbg.lan/api/live` |
| Probe ingest | `http://wdmbg.lan/api/ingest/rollups` |

## Bring-up (docker.lan)

```bash
ssh user@docker.lan
mkdir -p ~/src && cd ~/src
git clone https://github.com/mkronvold/wdmbg.git wdmbg   # or pull
cd ~/src/wdmbg/deploy/compose
cp ../env/.env.example ../env/.env
cp ../env/api.env.example ../env/api.env
chmod 600 ../env/.env ../env/api.env
# edit POSTGRES_PASSWORD etc. — never commit
# ensure external network exists:
docker network inspect nginxproxy_proxy-net >/dev/null
./up.sh
docker compose -f compose.prod.yml ps
```

### GeoIP (optional)

1. Obtain GeoLite2-Country.mmdb under your MaxMind license.
2. Place on docker.lan, e.g. `~/data/geoip/GeoLite2-Country.mmdb`.
3. Set `WDMBG_GEOIP_HOST_PATH` in `deploy/env/.env` and `WDMBG_GEOIP_DB_PATH=/data/geoip/GeoLite2-Country.mmdb` in `api.env`.
4. Without a DB: private IPs → **Local**, others → **Unknown**.

### Postgres metadata

API applies schema on startup when `WDMBG_DATABASE_URL` is set:

- `aliases` — persistent host labels
- `lookup_cache` — PTR / geo cache
- `settings` — reserved key/value

If `WDMBG_DATABASE_URL` is unset, API uses in-memory meta (dev).

## Probe install (proxbox1)

See [PROBE.md](./PROBE.md) and [`deploy/proxbox1/`](../deploy/proxbox1/).  
**Do not** `enable --now` until simulate smoke against ingest succeeds.

## Safety checklist

1. Internal routes and DNS only — no public DNS records.
2. No public TLS issuance or internet exposure.
3. No host port publishes when NPM can reach web on `nginxproxy_proxy-net`.
4. Attach **only** web to the proxy network.
5. Keep api/postgres on the app-local network.
6. Secrets in mode-600 env files; never print values.
7. Manage AdGuard rewrites and NPM hosts via UI/API — not live config file hacks.
8. Prefer completing git + docs over risky live host mutation when blocked.

## Live deploy status

Automated live push to docker.lan / proxbox1 is **opt-in**. This MVP ships compose,
images workflow skeleton, and docs. Perform host mutations only after image publish
and a manual smoke checklist.