# Probe (Go) — WDMBG delta

The probe is the main **delta** from a pure Node product-app monorepo in
[`mkronvold/techstack`](https://github.com/mkronvold/techstack).

Home app stack deploy: [DEPLOY-HOME.md](./DEPLOY-HOME.md)

## Why Go on the host

- Runs on the Proxmox host with access to bridges / taps
- Host-native binary under **systemd** (no container networking in MVP)
- Posts JSON rollup batches to the API over HTTP

## Deploy target (locked)

| Item | Value |
| --- | --- |
| Host alias | `proxbox1` |
| Hostname | `proxmox1` |
| SSH | `proxbox1` (SSH config host; or `root@proxmox1`) |
| Runtime | Host-native Go binary + **systemd only** |
| Capture | Configurable interface (`tap*` / `vmbr*`) on that host |
| Ingest URL | `http://wdmbg.lan/api/ingest/rollups` |

Unit + env examples: [`deploy/proxbox1/`](../deploy/proxbox1/).

## Build and test

```bash
cd apps/probe
go test ./...
go run . -version
go run . -help
go run . -simulate -once -ingest-url http://127.0.0.1:4080/api/ingest/rollups
GOOS=linux GOARCH=amd64 go build -o wdmbg-probe .
```

On Linux with libpcap:

```bash
# requires libpcap-dev and CAP_NET_RAW / root for most ifaces
go run . -iface vmbr0 -ingest-url http://wdmbg.lan/api/ingest/rollups
```

### Flags / env

| Flag | Env | Default |
| --- | --- | --- |
| `-iface` | `WDMBG_CAPTURE_IFACE` | `vmbr0` |
| `-ingest-url` | `WDMBG_API_INGEST_URL` | `http://wdmbg.lan/api/ingest/rollups` |
| `-probe-id` | `WDMBG_PROBE_ID` | `probe-1` |
| `-snaplen` | `WDMBG_SNAPLEN` | `128` |
| `-interval` | `WDMBG_BATCH_INTERVAL_SEC` | `1` |
| `-simulate` | `WDMBG_SIMULATE` | off |
| `-once` | — | run brief simulate and exit |

## Runtime layout

| Item | Intent |
| --- | --- |
| Binary path | `/usr/local/bin/wdmbg-probe` |
| Unit | `deploy/proxbox1/wdmbg-probe.service` → `/etc/systemd/system/` |
| Env | `deploy/proxbox1/wdmbg-probe.env.example` → `/etc/wdmbg/probe.env` (mode 600) |
| Transport | HTTP `POST` JSON rollup batches with exponential backoff |
| Aggregation | 1s bidirectional flow buckets |

## Safety

1. Confirm capture iface (`ip -br link`) before enabling the unit.
2. Smoke with `-simulate -once` against a live API first.
3. Do not leave the unit enabled if ingest URL is wrong (avoids retry storms).
4. Prefer docs + artifacts over unattended enable on proxbox1.

## Out of MVP

- Containerized probe image
- nDPI / deep L7 classification
- Running the probe on `docker.lan`