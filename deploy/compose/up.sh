#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
log_dir="${WDMBG_LOG_DIR:-./logs}"
mkdir -p "$log_dir"
log_file="$log_dir/up-$ts.log"
exec > >(tee -a "$log_file") 2>&1
echo "[up] $(date -u +%FT%TZ) starting"
set -a
# shellcheck disable=SC1091
[[ -f ./images.env ]] && . ./images.env
# shellcheck disable=SC1091
[[ -f ../env/.env ]] && . ../env/.env
set +a
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d "$@"
echo "[up] done"