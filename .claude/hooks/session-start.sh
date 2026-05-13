#!/usr/bin/env bash
# SessionStart hook for aiedge-site.
#
# Ensures the cloud session is ready before Claude does anything:
#   1. node_modules is fresh (so the first npm run lint/build/test:chart
#      doesn't pay the install cost). Conditional — skips when
#      package-lock.json hasn't changed.
#   2. flyctl is on PATH so Claude can `fly logs`, `fly status`, or
#      `fly deploy -c fly.live-bars.toml` directly from the cloud session
#      when FLY_API_TOKEN is set in the Environment.
set -euo pipefail

cd "$(dirname "$0")/../.."

stamp=node_modules/.package-lock.json
if [ ! -d node_modules ] || [ ! -f "$stamp" ] || [ package-lock.json -nt "$stamp" ]; then
  echo "[session-start] Installing npm deps (npm ci)..."
  npm ci --no-audit --no-fund
else
  echo "[session-start] npm deps OK"
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "[session-start] Installing flyctl..."
  curl -fsSL --max-time 60 https://fly.io/install.sh | sh >/dev/null 2>&1 || {
    echo "[session-start] flyctl install failed (network?). Skipping."
    exit 0
  }
  ln -sf "$HOME/.fly/bin/flyctl" /usr/local/bin/flyctl 2>/dev/null || true
  ln -sf "$HOME/.fly/bin/flyctl" /usr/local/bin/fly    2>/dev/null || true
  echo "[session-start] flyctl installed: $(flyctl version 2>/dev/null | head -1 || echo unknown)"
else
  echo "[session-start] flyctl OK"
fi
