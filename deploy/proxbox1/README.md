# proxbox1 probe deploy stubs

> Public path (any capture host): [QUICKSTART.md](../../QUICKSTART.md). This page is the lab/`proxbox1` detail.

Target: SSH host `proxbox1` (hostname `proxmox1`).

## Install sketch (manual)

```bash
# on a build host with Go 1.25+ and linux target
cd apps/probe
GOOS=linux GOARCH=amd64 go build -o wdmbg-probe .

scp wdmbg-probe proxbox1:/usr/local/bin/wdmbg-probe
ssh proxbox1 'chmod 755 /usr/local/bin/wdmbg-probe'

scp deploy/proxbox1/wdmbg-probe.service proxbox1:/etc/systemd/system/
ssh proxbox1 'mkdir -p /etc/wdmbg && chmod 700 /etc/wdmbg'
scp deploy/proxbox1/wdmbg-probe.env.example proxbox1:/etc/wdmbg/probe.env
ssh proxbox1 'chmod 600 /etc/wdmbg/probe.env'
# edit WDMBG_CAPTURE_IFACE to the correct vmbr/tap before enable

ssh proxbox1 'systemctl daemon-reload'
# Smoke first (optional):
# ssh proxbox1 '/usr/local/bin/wdmbg-probe -simulate -once'
# Enable only after iface + ingest smoke succeed:
# ssh proxbox1 'systemctl enable --now wdmbg-probe'
```

Do **not** force-enable on proxbox1 without a successful smoke against `http://wdmbg.lan/api/ingest/rollups`.