#!/usr/bin/env python3
"""
Sync self-eval calibration progress to aiedge.trade.

Reads from ~/code/aiedge/self-eval/:
  - scoreboard.csv (per-figure calibration scores)
  - lessons.md (accumulated lessons)
  - done_figures.txt (figures completed)
  - queue.txt (next figures up)
  - corpus_stats.json (total figure count)

POSTs ProgressPayload to {base_url}/api/progress.

Usage:
    python3 scripts/sync_progress.py                       # local dev
    python3 scripts/sync_progress.py https://www.aiedge.trade  # production
"""

import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).parent))
from _sync_auth import add_auth_header  # noqa: E402

DEFAULT_URL = "http://localhost:3000"
SELF_EVAL_DIR = Path.home() / "code" / "aiedge" / "self-eval"


def load_scoreboard() -> list[dict]:
    path = SELF_EVAL_DIR / "scoreboard.csv"
    if not path.exists():
        return []
    entries = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                total = int(row.get("total_agree", "0") or "0")
            except ValueError:
                total = 0
            entries.append({
                "date": row.get("date", ""),
                "figureNumber": row.get("figure_number", ""),
                "book": row.get("book", ""),
                "phase": row.get("phase", "MISS"),
                "alwaysIn": row.get("always_in", "MISS"),
                "strength": row.get("strength", "MISS"),
                "setup": row.get("setup", "MISS"),
                "decision": row.get("decision", "MISS"),
                "totalAgree": total,
            })
    return entries


def load_lessons() -> list[dict]:
    path = SELF_EVAL_DIR / "lessons.md"
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    lessons = []
    blocks = re.split(r"\n(?=## L\d+)", text)
    for block in blocks:
        header = re.match(r"^## (L\d+)\s*[—–-]\s*(.+?)\s*\n", block, flags=re.MULTILINE)
        if not header:
            continue
        id_ = header.group(1)
        title = header.group(2).strip()

        from_match = re.search(r"\*\*From:\*\*\s*(.+?)(?:\n|$)", block)
        from_raw = from_match.group(1).strip() if from_match else ""
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", from_raw)
        from_date = date_match.group(1) if date_match else ""
        from_figure = re.sub(r"\s*—\s*\d{4}-\d{2}-\d{2}\s*$", "", from_raw).strip()

        pattern_match = re.search(
            r"\*\*Pattern I missed:\*\*\s*(.+?)(?:\n\*\*|$)", block, flags=re.DOTALL
        )
        pattern_missed = pattern_match.group(1).strip() if pattern_match else ""

        rule_match = re.search(
            r"\*\*Future rule:\*\*\s*(.+?)(?:\n\n|\n##|$)", block, flags=re.DOTALL
        )
        future_rule = rule_match.group(1).strip() if rule_match else ""

        lessons.append({
            "id": id_,
            "title": title,
            "fromFigure": from_figure,
            "fromDate": from_date,
            "patternMissed": pattern_missed,
            "futureRule": future_rule,
        })
    return lessons


def count_completed() -> int:
    path = SELF_EVAL_DIR / "done_figures.txt"
    if not path.exists():
        return 0
    lines = [l for l in path.read_text().splitlines() if l.strip()]
    return len(lines)


def load_figures_total() -> int:
    path = SELF_EVAL_DIR / "corpus_stats.json"
    if not path.exists():
        return 687
    try:
        data = json.loads(path.read_text())
        total = data.get("total_records")
        return int(total) if isinstance(total, (int, float)) else 687
    except Exception:
        return 687


def load_next_queue() -> list[str]:
    path = SELF_EVAL_DIR / "queue.txt"
    if not path.exists():
        return []
    lines = path.read_text().strip().splitlines()[:10]
    out = []
    for line in lines:
        parts = line.split("\t")
        if len(parts) >= 3:
            out.append(f"Fig {parts[1]} — {parts[2]}")
        else:
            out.append(line)
    return out


def aggregate_accuracy(scoreboard: list[dict]) -> dict:
    def empty():
        return {"agree": 0, "partial": 0, "miss": 0}

    acc = {
        "phase": empty(),
        "alwaysIn": empty(),
        "strength": empty(),
        "setup": empty(),
        "decision": empty(),
    }

    def bump(bucket, score):
        if score == "AGREE":
            bucket["agree"] += 1
        elif score == "PARTIAL":
            bucket["partial"] += 1
        else:
            bucket["miss"] += 1

    for e in scoreboard:
        bump(acc["phase"], e["phase"])
        bump(acc["alwaysIn"], e["alwaysIn"])
        bump(acc["strength"], e["strength"])
        bump(acc["setup"], e["setup"])
        bump(acc["decision"], e["decision"])
    return acc


def post_json(url: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    add_auth_header(req)
    with urlopen(req) as resp:
        return json.loads(resp.read())


def sync(base_url: str):
    base_url = base_url.rstrip("/")

    scoreboard = load_scoreboard()
    lessons = load_lessons()
    completed = count_completed()
    total = load_figures_total()
    queue = load_next_queue()
    accuracy = aggregate_accuracy(scoreboard)

    payload = {
        "scoreboard": scoreboard,
        "lessons": lessons,
        "figuresCompleted": completed,
        "figuresTotal": total,
        "nextQueue": queue,
        "categoryAccuracy": accuracy,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }

    print(
        f"Progress: {completed}/{total} figures, "
        f"{len(lessons)} lessons, {len(scoreboard)} scoreboard entries"
    )
    print(f"Syncing to {base_url}/api/progress...")
    try:
        result = post_json(f"{base_url}/api/progress", payload)
        print(f"  OK — {result}")
    except Exception as e:
        print(f"  ERROR: {e}")


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    sync(base)
