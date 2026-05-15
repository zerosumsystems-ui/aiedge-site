#!/usr/bin/env python3
"""
Sync autonomous-routine status to aiedge.trade /api/routines.

Collects the status of launchd agents + cron-driven scripts and posts a
compact status blob for the /routines dashboard.

Usage:
    python3 scripts/sync_routines.py                      # local dev
    python3 scripts/sync_routines.py https://aiedge.trade # production
"""

from __future__ import annotations

import json
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).parent))
from _sync_auth import add_auth_header  # noqa: E402

HOME = Path.home()
DEFAULT_URL = "http://localhost:3000"

SCANNER_LOG_DIR = HOME / "code/aiedge/scanner/_logs"
GAPS_OUTPUT_DIR = HOME / "gaps/output"
VIDEOPIPELINE_LOG_DIR = HOME / "video-pipeline/logs"
MORNING_BRIEFING = GAPS_OUTPUT_DIR / "morning_briefing.md"
VAULT_SYNC_LOG = HOME / "bin/sync-aiedge-vault.log"  # optional

# Staleness thresholds (hours) per category. >threshold = "stale"
STALENESS_HOURS = {
    "scanner": 80,          # Mon–Fri weekday cycle; Friday → Monday ≈ 72h
    "briefing": 30,         # daily at 01:00
    "videopipeline": 80,    # weekday cycle
    "gaps": 80,             # weekday cycle (PM cron) + daily launchd
    "sync": 1,              # every 15m → anything >1h is suspicious
    "other": 80,
}

# launchd agents we report on.
# Tuple: (label, display, category, schedule, source_hint)
AGENTS: list[tuple[str, str, str, str, str | None]] = [
    ("com.aiedge.scanner",             "AI Edge Scanner",   "scanner",       "Mon–Fri 09:15 → 16:05 ET", "scanner_log"),
    ("com.videopipeline.premarket",    "Premarket",         "videopipeline", "Mon–Fri 08:45 ET",         "vp:premarket"),
    ("com.videopipeline.gap_up",       "Gap Up",            "videopipeline", "Mon–Fri 10:00 ET",         "vp:gap_up"),
    ("com.videopipeline.gap_down",     "Gap Down",          "videopipeline", "Mon–Fri 10:00 ET",         "vp:gap_down"),
    ("com.videopipeline.new_highs",    "New Highs",         "videopipeline", "Mon–Fri 16:15 ET",         "vp:new_highs"),
    ("com.videopipeline.new_lows",     "New Lows",          "videopipeline", "Mon–Fri 16:15 ET",         "vp:new_lows"),
    ("com.videopipeline.best_stocks",  "Best Stocks",       "videopipeline", "Mon–Fri 16:30 ET",         "vp:best_stocks"),
    ("com.videopipeline.industry_groups","Industry Groups", "videopipeline", "Mon–Fri 16:45 ET",         "vp:industry_groups"),
    ("com.will.trading-reports",       "Trading Reports",   "other",         "Mon–Fri 16:15 ET",         None),
    ("com.gaps.daily-scanner",         "Gap Scanner (AM)",  "gaps",          "Daily 05:30 local",        None),
]

# Cron-only jobs (no launchctl entry)
# Tuple: (id, display, category, schedule, mtime_hint_path)
CRONS: list[tuple[str, str, str, str, Path | None]] = [
    ("vault_sync",      "Vault → Drive Sync", "sync",     "Every 15m",             None),
    ("nightly_council", "Nightly Council",    "briefing", "Daily 01:00",           MORNING_BRIEFING),
    ("gaps_cron",       "Gap Scanner (PM)",   "gaps",     "Weekdays 17:00",        None),
]


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=False).stdout


def parse_launchctl() -> dict[str, tuple[str, str]]:
    """Map launchd label -> (pid, last_exit_status_string)."""
    out = run(["launchctl", "list"])
    result: dict[str, tuple[str, str]] = {}
    for line in out.splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) >= 3:
            pid, status, label = parts[0], parts[1], parts[2]
            result[label] = (pid, status)
    return result


def file_mtime_iso(p: Path | None) -> str | None:
    if p is None or not p.exists():
        return None
    return datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()


def latest_in(dirpath: Path, glob: str = "*") -> Path | None:
    if not dirpath.is_dir():
        return None
    files = [p for p in dirpath.glob(glob) if p.is_file()]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def scanner_summary() -> tuple[str | None, str | None]:
    """Return (last_run_iso, output_summary) based on the newest scanner log."""
    latest = latest_in(SCANNER_LOG_DIR, "live_scanner_*.log")
    if latest is None:
        return None, None
    last_run = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc).isoformat()
    try:
        content = latest.read_text(encoding="utf-8", errors="ignore")
        tail = "\n".join(content.splitlines()[-300:])
        m = re.search(r"(\d+)\s+top[- ]urgency", tail, re.IGNORECASE)
        if m:
            return last_run, f"{m.group(1)} top-urgency"
        m = re.search(r"(\d+)\s+setups?\s+(?:detected|found)", tail, re.IGNORECASE)
        if m:
            return last_run, f"{m.group(1)} setups"
    except Exception:
        pass
    return last_run, None


def videopipeline_summary(key: str) -> tuple[str | None, str | None]:
    dirpath = VIDEOPIPELINE_LOG_DIR / key
    latest = latest_in(dirpath)
    if latest is None:
        return None, None
    return file_mtime_iso(latest), None


def vault_sync_last_run() -> str | None:
    """Vault sync writes to Drive. We infer last-run from the vault folder's
    touched state — crude but good enough for v0."""
    # Try the script itself as a fallback; anything better would require a log
    for candidate in (VAULT_SYNC_LOG, HOME / "bin/sync-aiedge-vault.sh"):
        iso = file_mtime_iso(candidate)
        if iso:
            return iso
    return None


def determine_status(last_run_iso: str | None, exit_status: str | None, category: str) -> str:
    if exit_status is not None and exit_status not in ("", "0", "-"):
        # Non-zero exit code = failed
        try:
            if int(exit_status) != 0:
                return "failed"
        except ValueError:
            pass
    if last_run_iso is None:
        return "unknown"
    age_hours = (
        datetime.now(timezone.utc) - datetime.fromisoformat(last_run_iso)
    ).total_seconds() / 3600
    threshold = STALENESS_HOURS.get(category, 80)
    return "stale" if age_hours > threshold else "healthy"


def collect() -> list[dict]:
    launchctl = parse_launchctl()
    routines: list[dict] = []

    for label, display, category, schedule, source in AGENTS:
        pid, exit_status = launchctl.get(label, ("-", None))  # type: ignore[assignment]

        last_run: str | None = None
        summary: str | None = None

        if source == "scanner_log":
            last_run, summary = scanner_summary()
        elif source and source.startswith("vp:"):
            last_run, summary = videopipeline_summary(source.split(":", 1)[1])

        status = determine_status(last_run, exit_status, category)
        try:
            exit_int = int(exit_status) if exit_status and exit_status != "-" else None
        except ValueError:
            exit_int = None

        routines.append({
            "id": label,
            "label": display,
            "category": category,
            "schedule": schedule,
            "lastRunAt": last_run,
            "lastExitStatus": exit_int,
            "outputSummary": summary,
            "status": status,
        })

    for cid, display, category, schedule, path_hint in CRONS:
        if cid == "vault_sync":
            last_run = vault_sync_last_run()
        else:
            last_run = file_mtime_iso(path_hint)
        status = determine_status(last_run, None, category)
        routines.append({
            "id": cid,
            "label": display,
            "category": category,
            "schedule": schedule,
            "lastRunAt": last_run,
            "lastExitStatus": None,
            "outputSummary": None,
            "status": status,
        })

    return routines


def sync(base_url: str) -> None:
    routines = collect()
    payload = {
        "routines": routines,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "hostName": socket.gethostname(),
    }

    url = f"{base_url.rstrip('/')}/api/routines"
    data = json.dumps(payload).encode("utf-8")

    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    add_auth_header(req)

    print(f"Syncing {len(routines)} routines to {url}...")
    try:
        with urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"OK — {result.get('count', '?')} routines synced")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    sync(base)
