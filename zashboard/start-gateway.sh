#!/bin/bash
# Start the zashboard gateway with a KNOWN-GOOD interpreter, regardless of what
# `python3` supervisord's PATH happens to resolve to.
#
# Why: the gateway needs PyYAML at runtime (the rules reconciler imports it via
# importlib). The system python (/usr/bin/python3.10) historically LACKED yaml,
# which broke rule saving with a misleading "Rules supervisord" error.
#
# v3 (2026-09-01): run as unprivileged user `zdashboard` (supervisor user=).
#   - interpreter pick: first candidate that can `import yaml`
#   - log file chosen by HOST IP (NOT hostname: both Bohrium containers share
#     the bohrium-* prefix, so hostname cannot distinguish tebi from pxed):
#       10.5.103.26 -> tebi, 10.5.103.87 -> pxed (same mapping as gateway.py
#       get_remote_node_ip). Fallback: gateway-unknown.log so nothing is lost.
#   - exec gateway.py under the picked interpreter.
# Reversible: supervisor conf `user=` is the switch; bak files kept on both
# hosts (zashboard-gateway.conf.bak-rootuser / supervisor-zashboard.conf.bak-rootuser).
set -euo pipefail
cd /personal/zashboard

# Preferred candidates, in decreasing preference order.
CANDIDATES=(
  /opt/mamba/bin/python3
  /usr/bin/python3
  python3
)

have_yaml() {
  "$1" -c 'import yaml' 2>/dev/null
}

PY=""
for c in "${CANDIDATES[@]}"; do
  if have_yaml "$c"; then
    PY="$c"
    break
  fi
done

if [ -z "$PY" ]; then
  echo "[start-gateway] no interpreter with pyyaml found in: ${CANDIDATES[*]}" >&2
  exit 1
fi
echo "[start-gateway] using interpreter: $PY"

# Host-IP based log file selection (hostname is NOT unique across the two
# Bohrium containers: both are bohrium-<jobid>-*). Use the picked python for
# detection: `ip`/sbin tools are not on the unprivileged user's PATH.
HOST_IP="$($PY -c 'import socket
s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("10.255.255.255", 1))
    print(s.getsockname()[0])
except OSError:
    print("")
finally:
    s.close()')"
case "$HOST_IP" in
  10.5.103.26) LOG=/personal/zashboard/gateway-tebi.log ;;
  10.5.103.87) LOG=/personal/zashboard/gateway-pxed.log ;;
  *)           LOG=/personal/zashboard/gateway-unknown.log ;;
esac

# Startup diagnostics go to the same per-host log (gateway.py's own
# _startup_diagnostics() prints at boot; supervisor captures it via stdout).
exec "$PY" gateway.py >> "$LOG" 2>&1
