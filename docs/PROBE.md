# Probe (Go) — WDMBG delta

The probe is the main **delta** from a pure Node product-app monorepo in
[`mkronvold/techstack`](https://github.com/mkronvold/techstack).

## Why Go on the host

- Runs on the Proxmox host (or similar) with access to bridges / taps / mirrors
- Host-native binary under **systemd** (no container networking indirection in MVP)
- Posts JSON batches to the API over HTTP

## Phase 0

Module: `apps/probe`

```bash
cd apps/probe
go test ./...
go run . -version
go run . -help
go build -o wdmbg-probe .
```

Prints version/help only. Capture, buffering, and `POST` ingest are later phases.

## Planned runtime (not implemented)

| Item | Intent |
| --- | --- |
| Unit file | `wdmbg-probe.service` (restart on failure) |
| Config | Env or drop-in file: API base URL, probe id, batch interval |
| Transport | HTTP `POST` JSON batches to API |
| Privilege | Only as required for packet capture (document capabilities later) |

## Out of MVP

- Containerized probe image
- nDPI / deep L7 classification
