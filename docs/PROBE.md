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
| Address | `10.0.0.193` |
| SSH | `root@10.0.0.193` (or SSH config host `proxbox1`) |
| Runtime | Host-native Go binary + **systemd only** |
| Capture | Configurable interface (`tap*` / `vmbr*`) on that host |
| Ingest URL | `http://wdmbg.lan/api/ingest/rollups` |

Scaffold unit + env examples: [`deploy/proxbox1/`](../deploy/proxbox1/).

**Phase 0:** stubs and docs only — do not install or start the unit yet.

## Phase 0 module

```bash
cd apps/probe
go test ./...
go run . -version
go run . -help
go build -o wdmbg-probe .
```

Prints version/help only. Capture, buffering, and `POST` ingest are later phases.

## Planned runtime

| Item | Intent |
| --- | --- |
| Binary path | e.g. `/usr/local/bin/wdmbg-probe` |
| Unit | `deploy/proxbox1/wdmbg-probe.service` → `/etc/systemd/system/` |
| Env | `deploy/proxbox1/wdmbg-probe.env.example` → `/etc/wdmbg/probe.env` (mode 600) |
| Capture iface | `WDMBG_CAPTURE_IFACE` (tap/vmbr on proxmox1) |
| API | `WDMBG_API_INGEST_URL=http://wdmbg.lan/api/ingest/rollups` |
| Transport | HTTP `POST` JSON rollup batches |
| Restart | `on-failure` via systemd |

Install sketch (later phase):

```bash
ssh proxbox1   # root@10.0.0.193
# copy binary, unit, env; systemctl daemon-reload && enable --now wdmbg-probe
```

## Out of MVP

- Containerized probe image
- nDPI / deep L7 classification
- Running the probe on `docker.lan`
