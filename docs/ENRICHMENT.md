# Enrichment

## Country rules

| Condition | Label |
| --- | --- |
| RFC1918 / loopback / link-local / ULA | `Local` |
| No GeoIP hit | `Unknown` |
| GeoIP DB hit (when reader + DB present) | ISO country name/code |

Dashboard "top traffic by country" attributes bytes to the **external** peer when the
other side is local.

## Hostname resolution

`POST /api/resolve` (and dashboard labels via `asLabelLookup`) resolve each host IP with
this **first-hit-wins** chain:

| Order | Source | `ResolveResult.source` |
| --- | --- | --- |
| 1 | Persistent alias (`PUT /api/alias`) | `alias` |
| 2 | AdGuard DNS rewrites (IP match → domain) | `adguard-rewrite` |
| 3 | AdGuard DHCP leases (dynamic + static) | `adguard-dhcp` |
| 4 | AdGuard clients (persistent ids + auto clients) | `adguard-client` |
| 5 | Reverse DNS (PTR) | `ptr` |
| 6 | No name | `none` |

Successful AdGuard/PTR hits are written to `lookup_cache` (memory store or Postgres).
Cached hits return the original source (`adguard-*` / `ptr`) while still valid.
Dashboard `label` uses **alias**, else a non-expired cached hostname.

### AdGuard Home

Optional. When unset or unreachable, the chain skips silently to PTR.

| Variable | Purpose |
| --- | --- |
| `WDMBG_ADGUARD_URL` | Base URL, e.g. `http://adguard.lan` (no trailing path) |
| `WDMBG_ADGUARD_USER` / `WDMBG_ADGUARD_PASSWORD` | HTTP basic auth for the control API |
| `WDMBG_ADGUARD_ENABLED` | Optional; default **on** when URL is set. Set `0` to disable without removing URL |
| `WDMBG_ADGUARD_TIMEOUT_MS` | Per-request timeout (default `1500`) |
| `WDMBG_ADGUARD_REFRESH_MS` | Background map refresh interval (default `300000` = 5m) |
| `WDMBG_ADGUARD_CACHE_TTL_MS` | `lookup_cache` TTL for AdGuard hits (default `43200000` = 12h) |

API surface used (read-only):

- `GET /control/rewrite/list`
- `GET /control/dhcp/status`
- `GET /control/clients`

Never log passwords. Do not scrape the query log.

### PTR

- Memory store (dev) or `lookup_cache` table (Postgres)
- Disable with `WDMBG_PTR_ENABLED=0` (independent of AdGuard)
- Default PTR cache TTL remains 1 hour

### Docker / LAN reachability

The API container must resolve and reach AdGuard. On docker.lan, host DNS already points
at AdGuard; if the bridge network cannot resolve `adguard.lan`, set
`WDMBG_ADGUARD_URL` to a reachable address (LAN IP or documented host gateway) in
`deploy/env/api.env`. Prefer the hostname in public docs.

## GeoIP / ASN

Offline DB path: `WDMBG_GEOIP_DB_PATH` (see [DEPLOY-HOME.md](./DEPLOY-HOME.md)).  
MVP documents the path and Local/Unknown rules; full MMDB parsing can be layered later
without changing the API contract.
