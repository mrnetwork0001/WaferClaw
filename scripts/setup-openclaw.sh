#!/usr/bin/env bash
# Installs OpenClaw into .openclaw-sandbox/ inside this project and wires it to Kimi K3.1 Pro on
# Cerebras. Nothing is installed globally and ~/.openclaw is never read or written.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
S="$ROOT/.openclaw-sandbox"
OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.11.6}"

echo "WaferClaw: setting up an isolated OpenClaw in $S"
mkdir -p "$S/app" "$S/state" "$S/home" "$S/workspace"

# 1. Project-local install (needs Node >= 24.16)
if [ ! -x "$S/app/node_modules/.bin/openclaw" ]; then
  [ -f "$S/app/package.json" ] || echo '{"name":"openclaw-sandbox","private":true}' > "$S/app/package.json"
  (cd "$S/app" && npm install "openclaw@$OPENCLAW_VERSION" --no-fund --no-audit)
fi

# 2. Env file
if [ ! -f "$ROOT/.env.local" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env.local"
  chmod 600 "$ROOT/.env.local"
  echo "Created .env.local. Put your CEREBRAS_API_KEY in it, then re-run this script."
fi

# 3. Config: write the template first, install the search plugin, then select it
#    (OpenClaw rejects a config that names a search provider whose plugin is not installed yet).
if [ ! -f "$S/state/openclaw.json" ]; then
  cp "$ROOT/openclaw.config.json5" "$S/state/openclaw.json"
  "$ROOT/scripts/oc" plugins install @openclaw/duckduckgo-plugin
  node -e '
    const fs = require("fs"); const p = process.argv[1];
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    d.tools.web.search = { provider: "duckduckgo" };
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
  ' "$S/state/openclaw.json"
fi

# 4. Verify
"$ROOT/scripts/oc" --version | tail -1
"$ROOT/scripts/oc" config validate | tail -1
"$ROOT/scripts/oc" models list --provider cerebras | tail -4

set -a; . "$ROOT/.env.local"; set +a
if [ -n "${CEREBRAS_API_KEY:-}" ] && [ "$CEREBRAS_API_KEY" != "csk-your-cerebras-api-key-here" ]; then
  echo "Models your Cerebras key can use:"
  curl -sS https://api.cerebras.ai/v1/models -H "Authorization: Bearer $CEREBRAS_API_KEY" | grep -o '"id":"[^"]*"' || true
else
  echo "Set CEREBRAS_API_KEY in .env.local to enable live runs."
fi
echo "Done. Start the app with: npm run dev   (http://localhost:3210)"
