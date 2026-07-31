# proxbox1 probe deploy stubs

Target: `root@10.0.0.193` (`proxbox1` / hostname `proxmox1`).

## Install sketch (manual)

```bash
# on a build host with Go 1.25+ and linux target
cd apps/probe
GOOS=linux GOARCH=amd64 go build -o wdmbg-probe .

scp wdmbg-probe root@10.0.0.193:/usr/local/bin/wdmbg-probe
ssh root@10.0.0.193 'chmod 755 /usr/local/bin/wdmbg-probe'

scp deploy/proxbox1/wdmbg-probe.service root@10.0.0.193:/etc/systemd/system/
ssh root@10.0.0.193 'mkdir -p /etc/wdmbg && chmod 700 /etc/wdmbg'
scp deploy/proxbox1/wdmbg-probe.env.example root@10.0.0.193:/etc/wdmbg/probe.env
ssh root@10.0.0.193 'chmod 600 /etc/wdmbg/probe.env'
# edit WDMBG_CAPTURE_IFACE to the correct vmbr/tap before enable

ssh root@10.0.0.193 'systemctl daemon-reload'
# Smoke first (optional):
# ssh root@10.0.0.193 '/usr/local/bin/wdmbg-probe -simulate -once'
# Enable only after iface + ingest smoke succeed:
# ssh root@10.0.0.193 'systemctl enable --now wdmbg-probe'
```

Do **not** force-enable on proxbox1 without a successful smoke against `http://wdmbg.lan/api/ingest/rollups`.