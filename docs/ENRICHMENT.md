# Enrichment

## Country rules

| Condition | Label |
| --- | --- |
| RFC1918 / loopback / link-local / ULA | `Local` |
| No GeoIP hit | `Unknown` |
| GeoIP DB hit (when reader + DB present) | ISO country name/code |

Dashboard "top traffic by country" attributes bytes to the **external** peer when the
other side is local.

## PTR

`POST /api/resolve` performs on-demand reverse DNS with caching:

- Memory store (dev) or `lookup_cache` table (Postgres)
- Aliases always win over PTR
- Disable with `WDMBG_PTR_ENABLED=0`

## GeoIP / ASN

Offline DB path: `WDMBG_GEOIP_DB_PATH` (see [DEPLOY-HOME.md](./DEPLOY-HOME.md)).  
MVP documents the path and Local/Unknown rules; full MMDB parsing can be layered later
without changing the API contract.