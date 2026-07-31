#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
log_dir="${WDMBG_LOG_DIR:-./logs}"
mkdir -p "$log_dir"
log_file="$log_dir/down-$ts.log"
exec > >(tee -a "$log_file") 2>&1
echo "[down] $(date -u +%FT%TZ) starting"
# Intentionally no --volumes by default (preserve postgres data).
docker compose -f compose.prod.yml down "$@"
echo "[down] done"