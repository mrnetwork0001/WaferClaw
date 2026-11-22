#!/usr/bin/env bash
# Speed Bounty: starts the PATCHED OpenClaw gateway (isolated in .openclaw-sandbox/bounty) and opens
# its web chat, where the official "<mean> tok/s mean · <p90> p90 (server)" readout appears.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
B="$ROOT/.openclaw-sandbox/bounty"
PORT="${BOUNTY_PORT:-18790}"
[ -f "$B/openclaw/openclaw.mjs" ] || { echo "Patched OpenClaw is not built yet. See OPENCLAW_SETUP.md."; exit 1; }
if ! curl -s -o /dev/null -m 3 "http://127.0.0.1:$PORT/"; then
  echo "Starting patched OpenClaw gateway on 127.0.0.1:$PORT (log: $B/gateway.log)"
  nohup "$ROOT/scripts/oc-bounty" gateway --port "$PORT" --bind loopback --allow-unconfigured > "$B/gateway.log" 2>&1 &
  for _ in $(seq 1 40); do curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/" && break; sleep 1; done
fi
"$ROOT/scripts/oc-bounty" --version | tail -1
echo "Opening the web chat. Paste the Speed Bounty prompt from DEMO_SCRIPT.md and record the screen."
if [ "${1:-}" = "--clean" ]; then
  # Chrome app window: no tabs, bookmarks or extensions in frame, which suits a screen recording.
  URL="$("$ROOT/scripts/oc-bounty" dashboard --no-open --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).browserUrl))')"
  open -na "Google Chrome" --args --app="$URL" --window-size=1500,950
else
  "$ROOT/scripts/oc-bounty" dashboard
fi
echo "Stop the gateway later with: pkill -f 'openclaw.mjs gateway --port $PORT'"
