#!/usr/bin/env python3
"""
Sync Brooks audits to aiedge.trade.

Reads from ~/code/aiedge/audits/<date_time>/:
  - SUMMARY_REPORT.md
  - audit/ranking_comparison.csv
  - audit/reads/*.md
  - audit/charts_annotated/*.png
  - audit/methodology_critique.md

POSTs AuditPayload to {base_url}/api/review.

Usage:
    python3 scripts/sync_audit.py                      # local dev
    python3 scripts/sync_audit.py https://www.aiedge.trade  # production
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
from _chart_data import build_charts_for_audit, parse_audit_dir_name  # noqa: E402

DEFAULT_URL = "http://localhost:3000"
AUDIT_BASE = Path.home() / "code" / "aiedge" / "audits"


def parse_dir_name(name: str) -> tuple[str, str]:
    date_match = re.match(r"^(\d{4}-\d{2}-\d{2})", name)
    date = date_match.group(1) if date_match else ""
    time_match = re.search(r"_(\d{2})(\d{2})ET", name)
    time = ""
    if time_match:
        h, m = int(time_match.group(1)), int(time_match.group(2))
        ampm = "AM" if h < 12 else "PM"
        h12 = 12 if h == 0 else h - 12 if h > 12 else h
        time = f"{h12}:{m:02d} {ampm} ET"
    return date, time


def list_audit_dirs() -> list[Path]:
    if not AUDIT_BASE.is_dir():
        return []
    return sorted(
        [d for d in AUDIT_BASE.iterdir() if d.is_dir() and (d / "audit" / "ranking_comparison.csv").exists()],
        reverse=True,
    )


def parse_ranking_csv(path: Path) -> list[dict]:
    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "rankScanner": int(row.get("rank_scanner", 0) or 0),
                "rankBrooks": int(row.get("rank_brooks", 0) or 0),
                "rankDelta": int(row.get("rank_delta", 0) or 0),
                "ticker": row.get("ticker", ""),
                "urgScanner": float(row.get("urg_scanner", 0) or 0),
                "brooksQualityScore": float(row.get("brooks_quality_score", 0) or 0),
                "signalScanner": row.get("signal_scanner", ""),
                "decisionBrooks": row.get("decision_brooks", "WAIT"),
                "phaseScanner": row.get("phase_scanner", ""),
                "phaseBrooks": row.get("phase_brooks", ""),
                "alwaysInScanner": row.get("always_in_scanner", ""),
                "alwaysInBrooks": row.get("always_in_brooks", ""),
                "probabilityBrooks": float(row.get("probability_brooks", 0) or 0),
                "rrBrooks": float(row.get("rr_brooks", 0) or 0),
                "agreementVsScanner": row.get("agreement_vs_scanner", "PARTIAL"),
                "agreementReason": row.get("agreement_reason", ""),
                "divergenceClass": row.get("divergence_class", "MINOR"),
            })
    return rows


def attach_reads_and_charts(symbols: list[dict], audit_dir: Path) -> None:
    reads_dir = audit_dir / "audit" / "reads"

    read_map: dict[str, str] = {}
    if reads_dir.is_dir():
        for f in reads_dir.glob("*.md"):
            m = re.match(r"\d+_([A-Z0-9]+)\.md", f.name)
            if m:
                read_map[m.group(1)] = f.read_text(encoding="utf-8")

    # Interactive chart data — bars + annotations from reads_parsed.json
    reads_parsed_file = audit_dir / "audit" / "reads_parsed.json"
    reads_by_ticker: dict[str, dict] = {}
    if reads_parsed_file.exists():
        try:
            parsed = json.load(reads_parsed_file.open())
            reads_by_ticker = {r["ticker"]: r for r in parsed}
        except Exception as e:
            print(f"  warn: failed to load reads_parsed.json: {e}")

    date, time_hm = parse_audit_dir_name(audit_dir.name)
    tickers = [s["ticker"] for s in symbols]
    chart_map: dict[str, dict] = {}
    if date and reads_by_ticker:
        try:
            chart_map = build_charts_for_audit(tickers, date, time_hm, reads_by_ticker)
            print(f"  built interactive chart data for {len(chart_map)}/{len(tickers)} tickers")
        except Exception as e:
            print(f"  warn: chart build failed: {e}")

    for sym in symbols:
        t = sym["ticker"]
        if t in read_map:
            sym["readMarkdown"] = read_map[t]
        if t in chart_map:
            sym["chart"] = chart_map[t]


def compute_agreement_distribution(rows: list[dict]) -> list[dict]:
    total = len(rows) or 1
    order = ["AGREE", "PARTIAL", "MINOR", "MAJOR", "DISAGREE", "INVERTED"]
    counts = {k: 0 for k in order}
    for r in rows:
        v = r["agreementVsScanner"]
        if v in counts:
            counts[v] += 1
    return [
        {"class": k, "count": counts[k], "pct": round(counts[k] / total * 100, 1)}
        for k in order
        if counts[k] > 0
    ]


def compute_divergence_distribution(rows: list[dict]) -> list[dict]:
    total = len(rows) or 1
    order = ["AGREE", "MINOR", "MAJOR", "INVERTED"]
    counts = {k: 0 for k in order}
    for r in rows:
        v = r["divergenceClass"]
        if v in counts:
            counts[v] += 1
    return [
        {"class": k, "count": counts[k], "pct": round(counts[k] / total * 100, 1)}
        for k in order
        if counts[k] > 0
    ]


def compute_brooks_top5(rows: list[dict]) -> list[dict]:
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            -r["brooksQualityScore"],
            -(r["probabilityBrooks"] * r["rrBrooks"]),
        ),
    )[:5]
    return [
        {
            "ticker": r["ticker"],
            "rankScanner": r["rankScanner"],
            "signalScanner": r["signalScanner"],
            "decisionBrooks": r["decisionBrooks"],
            "probability": r["probabilityBrooks"],
            "rr": r["rrBrooks"],
        }
        for r in sorted_rows
    ]


def compute_scanner_top5(rows: list[dict]) -> list[dict]:
    sorted_rows = sorted(rows, key=lambda r: r["rankScanner"])[:5]
    return [
        {
            "ticker": r["ticker"],
            "urgScanner": r["urgScanner"],
            "signalScanner": r["signalScanner"],
            "decisionBrooks": r["decisionBrooks"],
            "brooksQualityScore": r["brooksQualityScore"],
            "agreement": r["agreementVsScanner"],
        }
        for r in sorted_rows
    ]


def extract_failure_modes(critique: str) -> list[dict]:
    if not critique:
        return []
    part_b_idx = critique.find("## Part B")
    part_c_idx = critique.find("## Part C")
    if part_b_idx < 0:
        return []
    end = part_c_idx if part_c_idx > 0 else len(critique)
    part_b = critique[part_b_idx:end]

    sections = re.split(r"\n(?=### [A-Z]\d)", part_b)[1:]
    modes = []
    for section in sections:
        header = re.match(r"^### ([A-Z]\d+)\.\s*(.+?)\n", section)
        if not header:
            continue
        code = header.group(1)
        title = header.group(2).strip()
        body = section[header.end():].strip()

        tickers = set()
        for m in re.finditer(r"\[\d+\s+([A-Z]{1,6})\]", body):
            tickers.add(m.group(1))
        for m in re.finditer(r"\*\*([A-Z]{2,6})\*\*", body):
            tickers.add(m.group(1))

        file_match = re.search(r"([a-z_]+\.py:\d+(?:-\d+)?)", body)
        file_citation = file_match.group(1) if file_match else ""

        first_para = body.split("\n\n")[0].strip()
        description = first_para[:500] + "…" if len(first_para) > 500 else first_para

        modes.append({
            "id": code.lower(),
            "title": f"{code}. {title}",
            "affectedTickers": sorted(list(tickers))[:20],
            "fileCitation": file_citation,
            "description": description,
        })
    return modes


def build_audit_summary(audit_dir: Path) -> dict:
    name = audit_dir.name
    date, time = parse_dir_name(name)
    summary_md = ""
    critique_md = ""

    summary_file = audit_dir / "SUMMARY_REPORT.md"
    if summary_file.exists():
        summary_md = summary_file.read_text(encoding="utf-8")

    critique_file = audit_dir / "audit" / "methodology_critique.md"
    if critique_file.exists():
        critique_md = critique_file.read_text(encoding="utf-8")

    csv_file = audit_dir / "audit" / "ranking_comparison.csv"
    rows = parse_ranking_csv(csv_file) if csv_file.exists() else []

    return {
        "auditDate": date,
        "auditTime": time,
        "auditDir": name,
        "symbolCount": len(rows),
        "agreementDistribution": compute_agreement_distribution(rows),
        "divergenceDistribution": compute_divergence_distribution(rows),
        "brooksTop5": compute_brooks_top5(rows),
        "scannerTop5": compute_scanner_top5(rows),
        "failureModes": extract_failure_modes(critique_md),
        "summaryMarkdown": summary_md,
        "methodologyCritiqueMarkdown": critique_md,
    }


def build_history(dirs: list[Path]) -> list[dict]:
    out = []
    for d in dirs:
        date, time = parse_dir_name(d.name)
        csv_file = d / "audit" / "ranking_comparison.csv"
        count = 0
        if csv_file.exists():
            with open(csv_file) as f:
                count = max(0, sum(1 for _ in f) - 1)
        out.append({
            "auditDir": d.name,
            "auditDate": date,
            "auditTime": time,
            "symbolCount": count,
        })
    return out


def post_json(url: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    add_auth_header(req)
    with urlopen(req) as resp:
        return json.loads(resp.read())


def sync(base_url: str):
    base_url = base_url.rstrip("/")
    dirs = list_audit_dirs()
    if not dirs:
        print("No audit directories found under ~/code/aiedge/audits/")
        return

    latest = dirs[0]
    print(f"Latest audit: {latest.name}")

    summary = build_audit_summary(latest)
    symbols = parse_ranking_csv(latest / "audit" / "ranking_comparison.csv")
    attach_reads_and_charts(symbols, latest)

    history = build_history(dirs)

    payload = {
        "latest": summary,
        "symbols": symbols,
        "history": history,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }

    size_kb = len(json.dumps(payload)) / 1024
    print(
        f"Payload: {len(symbols)} symbols, "
        f"{len(summary['failureModes'])} failure modes, "
        f"{len(history)} history entries, {size_kb:.1f} KB"
    )
    print(f"Syncing to {base_url}/api/review...")
    try:
        result = post_json(f"{base_url}/api/review", payload)
        print(f"  OK — {result}")
    except Exception as e:
        print(f"  ERROR: {e}")


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    sync(base)
