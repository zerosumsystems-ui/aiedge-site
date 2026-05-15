#!/usr/bin/env python3
"""
Sync all local history snapshots to the /api/scan/history endpoint.

Reads all JSON files from ~/aiedge-history/ and POSTs them as a bulk payload.
Run this after a deploy or cold start to restore history.

Usage:
    python3 scripts/sync_history.py                     # local dev
    python3 scripts/sync_history.py https://www.aiedge.trade  # production
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).parent))
from _sync_auth import add_auth_header  # noqa: E402

HISTORY_DIR = Path.home() / "aiedge-history"
DEFAULT_URL = "http://localhost:3000"


def sync(base_url: str):
    if not HISTORY_DIR.is_dir():
        print(f"No history directory found: {HISTORY_DIR}")
        sys.exit(0)

    files = sorted(HISTORY_DIR.glob("*.json"))
    if not files:
        print("No history files found")
        sys.exit(0)

    snapshots = []
    for f in files:
        try:
            snap = json.loads(f.read_text(encoding="utf-8"))
            snapshots.append(snap)
        except Exception as e:
            print(f"WARN: skipping {f.name}: {e}")

    payload = {
        "snapshots": snapshots,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }

    url = f"{base_url.rstrip('/')}/api/scan/history"
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    add_auth_header(req)

    print(f"Syncing {len(snapshots)} days to {url}...")

    try:
        with urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"OK — {result.get('total', '?')} days synced")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    sync(base)
