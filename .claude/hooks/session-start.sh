#!/usr/bin/env bash
# SessionStart hook for aiedge-site.
#
# Ensures node_modules is fresh so the first `npm run lint/build/test:chart`
# in a session doesn't pay the install cost. Conditional — skips quietly when
# package-lock.json hasn't changed since the last install.
set -euo pipefail

cd "$(dirname "$0")/../.."

stamp=node_modules/.package-lock.json
if [ ! -d node_modules ] || [ ! -f "$stamp" ] || [ package-lock.json -nt "$stamp" ]; then
  echo "[session-start] Installing npm deps (npm ci)..."
  npm ci --no-audit --no-fund
else
  echo "[session-start] npm deps OK"
fi
