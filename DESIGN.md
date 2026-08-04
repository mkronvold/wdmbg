# Design

Why **WDMBG** exists, what it measures, and what it deliberately does not do.

Install path: [QUICKSTART.md](./QUICKSTART.md). Overview: [README.md](./README.md).

## Goals

- Answer **“Where did my bandwidth go?”** on a trusted LAN over short operational windows.
- Show, for a chosen window:
  - **Traffic summary** (Local vs Internet)
  - **Top talkers / receivers** (and optional Local-only variants)
  - **Bulk flows**, **protocols**, optional **countries**
  - **Per-host** drill-down (peers, flows, alias)
- Sample on the order of **1 Hz** with enough history for windows up to ~1 hour.
- Stay **small**: one probe binary, one API process, one static web UI, optional Postgres for metadata only.
- Deploy cleanly behind a normal reverse proxy on a LAN.
- Remain **independent** of Speedify, ntop, NetFlow/sFlow exporters, and similar tools.

## Non-goals (MVP)

- Not an **IDS/IPS**, DPI platform, or full packet recorder (snaplen stays small; L7 is port heuristics).
- Not a multi-month traffic accounting or billing system (no durable TSDB for rollups in MVP).
- Not dependent on **NetFlow / sFlow / IPFIX** exporters or ntop collectors.
- Not a WAN bonding health board (see [Relationship to speedify-status](#relationship-to-speedify-status)).
- No end-user accounts / OAuth / multi-tenant cloud SaaS.
- No requirement for public internet exposure or public DNS.
- Probe is not containerized in MVP (host-native + systemd).

## Data plane

```text
pcap (bridge/tap) ─▶ probe (≈1s flow buckets) ─POST─▶ API ring ─▶ GET /api/dashboard ─▶ web
                                              │
                                              └─▶ Postgres (aliases, lookup_cache, settings)
```

### Capture (probe)

| Input | Use |
| --- | --- |
| libpcap on configured iface | Headers for bidirectional flow keys |
| 1s batching | Rollup envelope → `POST /api/ingest/rollups` |

- Default interval **1 second**; snaplen kept small (headers, not full payloads).
- Flow keys: src/dst IP, ports, L4; optional L7 label from port heuristics.
- Bytes and packets accumulated both directions per second bucket.
- `-simulate` generates synthetic rollups for local dev without capture privileges.

### Storage (API)

- Fixed-size **in-memory ring**: **3600** slots ≈ **1 hour @ 1s** (`RING_BUCKET_COUNT`).
- Process restart clears traffic history; that is intentional for MVP.
- Query windows: `5s`, `30s`, `5m`, `15m`, `30m`, `1h`.
- **Postgres** (when configured) holds:
  - `aliases` — user-defined host labels
  - `lookup_cache` — hostname / geo cache
  - `settings` — reserved key/value
- Without `WDMBG_DATABASE_URL`, meta falls back to in-memory (fine for local dev).

### Presentation (web)

- Card grid: traffic summary, talkers, receivers, protocols, bulk flows, countries, optional URL embeds.
- Window selector + display refresh interval (independent of probe sample rate).
- Host dialog for drill-down; resolve-auto for unlabeled IPs.
- Talks only to same-origin `/api/*` (dev server or web nginx proxy).

## Privacy and trust

- Intended for a **trusted LAN** (or similarly private network).
- **No cloud dependency** for core monitoring; optional GeoIP DB is local file-based.
- Auth model MVP: **network placement** (LAN-trusted). No end-user login.
- Ingest path is reachable wherever you expose reverse-proxied `/api/ingest/rollups` — treat that as a LAN-only surface.
- Prefer **not** publishing API or Postgres host ports; only **web** on the proxy network.
- Captured data is metadata (IPs, ports, byte/packet counters), not full payloads, when snaplen stays at defaults.
- Do not commit real passwords or tokens; env examples use placeholders such as `change-me`.

## Relationship to speedify-status

| Concern | WDMBG | [speedify-status](https://github.com/mkronvold/speedify-status) |
| --- | --- | --- |
| Primary question | How much LAN traffic, and who? | Is each WAN healthy _right now_? |
| Timescale | Seconds–1 hour, live ring | Seconds–1 hour, live ring |
| Key metrics | Bytes, flows, talkers, protocols | RTT, Mbps, adapter state/priority |
| Coupling | pcap on a LAN bridge/tap | Speedify CLI + `/proc` + ICMP |
| Storage | Ring + optional Postgres meta | Ring only (MVP) |

Bonding/WAN health and LAN volume analytics are different jobs. Keeping the boards separate avoids overloaded UIs and decoupled release cycles. They can sit side by side (WDMBG URL cards are a convenient embed path).

## Future ideas

Not committed; useful directions if the MVP holds up:

| Idea | Notes |
| --- | --- |
| **Longer history** | Optional TSDB if multi-hour/day trends become required |
| **Richer L7** | nDPI or similar — deferred on purpose |
| **Ingest token** | Shared secret on `/api/ingest/*` if LAN trust is not enough |
| **Containerized probe** | For labs where host packages are awkward |
| **Arm packaging** | Prebuilt probe binaries for amd64/arm64 releases |
| **Autoupdate polish** | Lean more formally on `deploy/compose/autoupdate.sh` digests |

## Related docs

- [QUICKSTART.md](./QUICKSTART.md) — compose, proxy, probe, smoke tests
- [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md) — one lab’s concrete hostnames and checklist
- [docs/PROBE.md](./docs/PROBE.md) — probe flags, safety, build
- [docs/ENRICHMENT.md](./docs/ENRICHMENT.md) — AdGuard / PTR / GeoIP
- [docs/DOCKER.md](./docs/DOCKER.md) — compose topology and images
