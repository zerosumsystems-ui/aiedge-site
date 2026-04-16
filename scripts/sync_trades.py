#!/usr/bin/env python3
"""
Sync trade reads from Brooks audit and lessons from self-eval to aiedge.trade.

Usage:
    python3 scripts/sync_trades.py                     # local dev
    python3 scripts/sync_trades.py https://aiedge.trade # production
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

DEFAULT_URL = "http://localhost:3000"

# Data sources
AUDIT_BASE = Path.home() / "brooks_audit"
SELF_EVAL_DIR = Path.home() / "brooks_self_eval"


def find_latest_audit() -> Path | None:
    """Find the most recent audit directory."""
    if not AUDIT_BASE.is_dir():
        return None
    dirs = sorted(AUDIT_BASE.iterdir(), reverse=True)
    for d in dirs:
        if d.is_dir() and (d / "audit" / "reads_parsed.json").exists():
            return d
    return None


def extract_narrative(md_content: str) -> str:
    """Extract the narrative portion before the trailing YAML block."""
    # Split on the last --- delimiter that starts a YAML block
    parts = md_content.split("\n---\n")
    if len(parts) >= 2:
        # Everything before the last --- block is narrative
        return "\n---\n".join(parts[:-1]).strip()
    return md_content.strip()


def extract_date_from_audit_dir(audit_dir: Path) -> str:
    """Extract date from audit directory name like '2026-04-15_1255ET'."""
    name = audit_dir.name
    match = re.match(r"(\d{4}-\d{2}-\d{2})", name)
    return match.group(1) if match else datetime.now().strftime("%Y-%m-%d")


def extract_time_from_audit_dir(audit_dir: Path) -> str:
    """Extract time from audit directory name like '2026-04-15_1255ET'."""
    name = audit_dir.name
    match = re.search(r"_(\d{2})(\d{2})ET", name)
    if match:
        h, m = int(match.group(1)), int(match.group(2))
        ampm = "AM" if h < 12 else "PM"
        h12 = h if h <= 12 else h - 12
        if h12 == 0:
            h12 = 12
        return f"{h12}:{m:02d} {ampm} ET"
    return ""


def load_trades_from_audit(audit_dir: Path) -> list[dict]:
    """Load structured trade reads from an audit directory."""
    parsed_file = audit_dir / "audit" / "reads_parsed.json"
    reads_dir = audit_dir / "audit" / "reads"

    if not parsed_file.exists():
        return []

    with open(parsed_file) as f:
        parsed = json.load(f)

    date = extract_date_from_audit_dir(audit_dir)
    time = extract_time_from_audit_dir(audit_dir)

    # Build a map of ticker -> narrative markdown from individual read files
    narratives = {}
    if reads_dir.is_dir():
        for md_file in sorted(reads_dir.glob("*.md")):
            content = md_file.read_text(encoding="utf-8")
            # Extract ticker from filename like "03_IGV.md"
            match = re.match(r"\d+_(\w+)\.md", md_file.name)
            if match:
                ticker = match.group(1)
                narratives[ticker] = extract_narrative(content)

    trades = []
    for rec in parsed:
        ticker = rec["ticker"]
        trade = {
            "id": f"{date}_{ticker}",
            "ticker": ticker,
            "date": date,
            "time": time,
            "rankScanner": rec.get("rank_scanner", 0),
            "urgScanner": rec.get("urg_scanner", 0),
            "signalScanner": rec.get("signal_scanner", ""),
            "phaseBrooks": rec.get("phase_brooks", ""),
            "alwaysInBrooks": rec.get("always_in_brooks", ""),
            "strengthNet": rec.get("signs_of_strength_net", ""),
            "setupBrooks": rec.get("setup_brooks", "none"),
            "signalBarIndex": rec.get("signal_bar_index"),
            "stopPrice": rec.get("stop_price"),
            "targetPrice": rec.get("target_price"),
            "decisionBrooks": rec.get("decision_brooks", "WAIT"),
            "probabilityBrooks": rec.get("probability_brooks", 50),
            "rrBrooks": rec.get("rr_brooks", 0),
            "qualityScore": rec.get("brooks_quality_score", 0),
            "agreementVsScanner": rec.get("agreement_vs_scanner", "PARTIAL"),
            "agreementReason": rec.get("agreement_reason", ""),
            "contextMarkdown": narratives.get(ticker, ""),
            "annotationNotes": "",
            "outcome": "no_trade",
        }

        # Extract annotation notes from hints
        hints = rec.get("annotation_hints", {})
        if isinstance(hints, dict):
            trade["annotationNotes"] = hints.get("notes", "")

        trades.append(trade)

    return trades


def load_lessons() -> list[dict]:
    """Load lessons from self-eval lessons.md."""
    lessons_file = SELF_EVAL_DIR / "lessons.md"
    if not lessons_file.exists():
        return []

    content = lessons_file.read_text(encoding="utf-8")
    entries = []

    # Parse lesson blocks: ## L<n> — Title
    blocks = re.split(r"(?=^## L\d+)", content, flags=re.MULTILINE)
    for block in blocks:
        block = block.strip()
        if not block.startswith("## L"):
            continue

        # Extract lesson number and title
        header_match = re.match(r"## (L\d+) — (.+)", block)
        if not header_match:
            continue

        lesson_id = header_match.group(1)
        title = header_match.group(2).strip()

        # Extract date from the **From:** line
        date_match = re.search(r"\*\*From:\*\*.*?(\d{4}-\d{2}-\d{2})", block)
        date = date_match.group(1) if date_match else "2026-04-11"

        # Extract linked figure references
        fig_match = re.search(r"Fig\s+(\d+\.\d+)\s+\((\w+)\)", block)
        linked_notes = []
        if fig_match:
            book = fig_match.group(2).lower()
            linked_notes.append(f"brooks-pa/concepts/{book}")

        entries.append({
            "id": f"{date}_lesson_{lesson_id}",
            "date": date,
            "type": "lesson",
            "title": f"{lesson_id} — {title}",
            "content": block,
            "linkedTickers": [],
            "linkedVaultNotes": linked_notes,
            "source": "self_eval",
        })

    return entries


def load_audit_journal_entries(audit_dir: Path) -> list[dict]:
    """Create a journal entry summarizing the audit findings."""
    summary_file = audit_dir / "SUMMARY_REPORT.md"
    if not summary_file.exists():
        return []

    date = extract_date_from_audit_dir(audit_dir)
    content = summary_file.read_text(encoding="utf-8")

    # Truncate to a reasonable summary (first ~2000 chars)
    if len(content) > 2000:
        content = content[:2000] + "\n\n*[Truncated — see full report]*"

    return [{
        "id": f"{date}_audit_summary",
        "date": date,
        "type": "audit_note",
        "title": f"Brooks Audit — {date}",
        "content": content,
        "linkedTickers": [],
        "linkedVaultNotes": ["scanner/audits/2026-04-15-audit-replay"],
        "source": "audit",
    }]


def post_json(url: str, payload: dict):
    """POST JSON payload to a URL."""
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")

    with urlopen(req) as resp:
        return json.loads(resp.read())


def sync(base_url: str):
    """Sync trades and journal entries."""
    base_url = base_url.rstrip("/")

    # --- Trades ---
    audit_dir = find_latest_audit()
    trades = []
    journal_entries = []

    if audit_dir:
        print(f"Found audit: {audit_dir.name}")
        trades = load_trades_from_audit(audit_dir)
        journal_entries.extend(load_audit_journal_entries(audit_dir))
    else:
        print("No audit directory found — skipping trade reads")

    if trades:
        payload = {
            "trades": trades,
            "syncedAt": datetime.now(timezone.utc).isoformat(),
            "tradeCount": len(trades),
        }
        print(f"Syncing {len(trades)} trades to {base_url}/api/trades...")
        try:
            result = post_json(f"{base_url}/api/trades", payload)
            print(f"  OK — {result.get('tradeCount', '?')} trades synced")
        except Exception as e:
            print(f"  ERROR: {e}")

    # --- Journal ---
    lessons = load_lessons()
    journal_entries.extend(lessons)

    if journal_entries:
        payload = {
            "entries": journal_entries,
            "syncedAt": datetime.now(timezone.utc).isoformat(),
            "entryCount": len(journal_entries),
        }
        print(f"Syncing {len(journal_entries)} journal entries to {base_url}/api/journal...")
        try:
            result = post_json(f"{base_url}/api/journal", payload)
            print(f"  OK — {result.get('entryCount', '?')} entries synced")
        except Exception as e:
            print(f"  ERROR: {e}")

    if not trades and not journal_entries:
        print("Nothing to sync.")


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    sync(base)
