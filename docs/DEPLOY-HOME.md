# Home deployment (docker.lan)

Baseline host rules: WSL `~/.promptlib/dockerhost-local.md`  
Compose helpers (when added): WSL `~/.promptlib/updown.md`  
Container packaging notes: [DOCKER.md](./DOCKER.md)  
Probe host: [PROBE.md](./PROBE.md)

**Phase 0:** document only — do not deploy yet.

## Targets

| Role | Host | Access |
| --- | --- | --- |
| App stack (web, api, postgres) | `docker.lan` (`10.0.0.202`) | SSH `mkronvold@docker.lan` |
| Probe (capture) | `proxbox1` / hostname `proxmox1` (`10.0.0.193`) | SSH `root@10.0.0.193` (alias `proxbox1`) |

## App directory on docker.lan

```text
~/src/wdmbg
```

Future Compose lives under that tree (or this repo checked out there). Helper
scripts will follow `updown.md`: repo-local `up.sh` / `down.sh` that `pull` then
`up -d`, and `down` without destructive volume flags by default.

## Networking (locked)

| Service | Networks | Published host ports |
| --- | --- | --- |
| `web` | app-local **and** `nginxproxy_proxy-net` | **None** |
| `api` | app-local only | **None** |
| `postgres` | app-local only | **None** |

- Shared proxy network name: **`nginxproxy_proxy-net`** (external; owned by NPM).
- Only the **web** service attaches to the proxy network.
- **API and Postgres stay off** `nginxproxy_proxy-net`.
- Web reverse-proxies browser traffic to the API:
  - HTTP API under `/api` (and app routes as designed)
  - WebSocket live feed under `/api/live` (later phase)
- No public DNS, no Let's Encrypt, no NAT/port-forward exposure.

## LAN DNS and NPM

| Item | Value |
| --- | --- |
| AdGuard rewrite | `wdmbg.lan` → `10.0.0.202` |
| NPM domain | `wdmbg.lan` |
| NPM scheme | `http` |
| NPM forward | Docker service alias for **web** + container port |
| SSL | None / Force SSL off |
| Websockets | Enable when `/api/live` lands |

NPM admin (internal): `http://npm.lan:81`. AdGuard UI: `http://adguard.lan`.

## Browser and probe URLs (planned)

| Client | URL |
| --- | --- |
| Dashboard | `http://wdmbg.lan/` |
| API via web proxy | `http://wdmbg.lan/api/...` |
| Health (via proxy once wired) | `http://wdmbg.lan/api/health` or path chosen at compose time |
| Probe ingest | `http://wdmbg.lan/api/ingest/rollups` (probe POSTs here; see [PROBE.md](./PROBE.md)) |

The probe reaches the API through the same LAN hostname; web terminates NPM and
proxies `/api` (and later `/api/live`) to the private API container.

## Safety checklist (from dockerhost-local)

1. Internal routes and DNS only — no public DNS records.
2. No public TLS issuance or internet exposure.
3. No host port publishes when NPM can reach web on `nginxproxy_proxy-net`.
4. Attach **only** web to the proxy network.
5. Keep api/postgres on the app-local network.
6. Secrets in mode-600 env files or equivalent; never print values.
7. Manage AdGuard rewrites and NPM hosts via UI/API — not live config file hacks.

## Out of Phase 0

- Compose files, Dockerfiles, `up.sh` / `down.sh`
- AdGuard rewrite creation
- NPM proxy host creation
- Image publish to GHCR and host pull
