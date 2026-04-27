#!/usr/bin/env python3
"""
In-place rewrite of corpus.json's first_6_bars.ema20 values from each
entry's per-slug session.json (which now has cross-day-seeded EMAs).

The corpus is already populated; we don't want to re-run the whole
backfill just to refresh the EMA channel. This walks each entry,
loads public/analogs/<slug>/session.json, copies the first 6 ema20
values into first_6_bars.ema20, and writes corpus.json back.

For the 43 original strong-trend entries that have inline full_session,
we ALSO refresh those if a session.json exists for them (with seeded
EMAs); otherwise leave them alone.
"""
from __future__ import annotations

import json
from pathlib import Path

CORPUS_PATH = Path(__file__).resolve().parent.parent / "public" / "analogs" / "corpus.json"
ANALOGS_ROOT = CORPUS_PATH.parent

N_OPEN_BARS = 6


def main() -> int:
    corpus = json.loads(CORPUS_PATH.read_text())
    entries = corpus.get("entries", [])
    print(f"Corpus: {len(entries)} entries")

    refreshed = 0
    no_session_file = 0
    for e in entries:
        slug = e.get("slug")
        session_path = ANALOGS_ROOT / slug / "session.json"
        if not session_path.exists():
            no_session_file += 1
            continue
        try:
            session = json.loads(session_path.read_text())
        except Exception:
            no_session_file += 1
            continue
        # Pull first 6 EMA20 values into first_6_bars.ema20
        first_6 = e.get("first_6_bars")
        if not first_6:
            continue
        new_ema = session.get("ema20", [])[:N_OPEN_BARS]
        if len(new_ema) != N_OPEN_BARS:
            continue
        first_6["ema20"] = new_ema
        refreshed += 1

    corpus["ema_seeding"] = "prior_trading_day_continuous"
    CORPUS_PATH.write_text(json.dumps(corpus, separators=(",", ":")))
    print(f"Refreshed first_6_bars.ema20 on {refreshed} entries "
          f"(skipped {no_session_file} with no session.json)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
