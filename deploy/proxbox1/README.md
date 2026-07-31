# proxbox1 probe deploy stubs

Target host: **proxbox1** (`proxmox1`, `10.0.0.193`), SSH `root@10.0.0.193`.

| File | Install path (later) |
| --- | --- |
| Built `wdmbg-probe` | `/usr/local/bin/wdmbg-probe` |
| `wdmbg-probe.service` | `/etc/systemd/system/wdmbg-probe.service` |
| `wdmbg-probe.env.example` → `probe.env` | `/etc/wdmbg/probe.env` (mode 600) |

See [docs/PROBE.md](../../docs/PROBE.md) and [docs/DEPLOY-HOME.md](../../docs/DEPLOY-HOME.md).

Do not enable the unit in Phase 0.
