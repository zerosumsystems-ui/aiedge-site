#!/usr/bin/env python3
"""
Capture end-of-day scan snapshot and push to history.

1. Fetches current scan from /api/scan (local or prod)
2. Saves to ~/aiedge-history/YYYY-MM-DD.json
3. POSTs snapshot to /api/scan/history

Usage:
    python3 scripts/capture_eod.py                     # local dev
    python3 scripts/capture_eod.py https://www.aiedge.trade  # production
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).parent))
from _sync_auth import add_auth_header  # noqa: E402

HISTORY_DIR = Path.home() / "aiedge-history"
DEFAULT_URL = "http://localhost:3000"


def capture(base_url: str):
    HISTORY_DIR.mkdir(exist_ok=True)

    # 1. Fetch current scan
    scan_url = f"{base_url.rstrip('/')}/api/scan"
    print(f"Fetching current scan from {scan_url}...")

    try:
        scan_req = Request(scan_url)
        add_auth_header(scan_req)
        with urlopen(scan_req) as resp:
            payload = json.loads(resp.read())
    except Exception as e:
        print(f"ERROR fetching scan: {e}")
        sys.exit(1)

    if not payload.get("results"):
        print("No scan results available — skipping capture")
        sys.exit(0)

    # Use the scan's own date, fall back to today
    date = payload.get("date") or datetime.now().strftime("%Y-%m-%d")
    now = datetime.now(timezone.utc).isoformat()

    snapshot = {
        "date": date,
        "payload": payload,
        "capturedAt": now,
    }

    # 2. Save locally
    local_file = HISTORY_DIR / f"{date}.json"
    local_file.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(f"Saved locally: {local_file}")

    # 3. POST to history API
    history_url = f"{base_url.rstrip('/')}/api/scan/history"
    data = json.dumps(snapshot).encode("utf-8")
    req = Request(history_url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    add_auth_header(req)

    try:
        with urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"Published to history: {result}")
    except Exception as e:
        print(f"ERROR posting history: {e}")
        print("(Local copy was saved successfully)")
        sys.exit(1)


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    capture(base)
