#!/usr/bin/env bash
# Validate the Clash/mihomo config files that the reconciler merges & writes.
#
# Background: config.mac-merged.yaml once accumulated two dangling proxy
# references in the cpa-cleanpage fallback group (an 'AK-[HTTP]' name and a
# 'Azure-HK-*' name), which made `mihomo -t` fail and aborted the reconciler's
# transactional save. This script is the repeatable regression guard for that
# fix (see §九 / §十二): it runs `mihomo -t` over both the base config and the
# mac-merged authoritative config, exits non-zero with the diff if either fails.
#
# Usage:
#   scripts/check-configs.sh [--mihomo /path/to/mihomo] [config...]
# Defaults: /personal/clash/mihomo, config.yaml + config.mac-merged.yaml in
# /personal/clash.
set -euo pipefail

MIHOMO="${MIHOMO:-/personal/clash/mihomo}"
CLASH_DIR="${CLASH_DIR:-/personal/clash}"

if [[ $# -eq 0 ]]; then
  CONFIGS=(config.yaml config.mac-merged.yaml)
else
  CONFIGS=("$@")
fi

if [[ ! -x "$MIHOMO" ]]; then
  echo "ERROR: mihomo binary not found at $MIHOMO" >&2
  exit 2
fi

fails=0
for cfg in "${CONFIGS[@]}"; do
  path="$CLASH_DIR/$cfg"
  if [[ ! -f "$path" ]]; then
    echo "ERROR: config missing: $path" >&2
    fails=1
    continue
  fi
  echo "==> validating $path"
  if ! "$MIHOMO" -t -f "$path"; then
    echo "FAIL: $path" >&2
    fails=1
  else
    echo "OK:   $path"
  fi
done

if (( fails )); then
  echo "FAIL: one or more configs failed validation (check dangling proxy refs)" >&2
  exit 1
fi
echo "ALL CONFIGS VALID"