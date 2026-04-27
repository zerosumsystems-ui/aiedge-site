#!/usr/bin/env python3
"""
Leave-one-out cross-validation of the analog matcher across the entire
corpus. The question: does the matcher's top-K majority direction predict
the query's actual direction better than chance?

For each session i in the corpus:
  - matches[i] is its top-K nearest neighbors (already self-excluded
    via the i!=j filter when match_analogs.py built matches.json)
  - For each top-K match j, read session_j's full RTH bars and compute
    its EOD direction (sign of close[-1] − close[5], in ATR units)
  - DTW-weighted vote = Σ w_j * sign(eod_j) for w_j = 1/(dtw_j + ε)
  - Predicted direction = sign of weighted vote
  - Actual direction for session i = sign of session_i's own EOD ATR
  - correct = predicted == actual (when both are clearly directional)

Aggregates:
  - Overall hit rate, with binomial p-value vs the 50/50 null
  - Hit rate by DTW tier (tight twin / strong / solid / loose / reaching)
  - Hit rate by predicted direction (up vs down)
  - Hit rate by ticker (does the matcher work better on QQQ than NVDA?)
  - Hit rate by month (drift over time?)

Output: public/analogs/corpus_validation.json — read by the site's
Accuracy tab to display historical validation alongside live tracking.
"""
from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

CORPUS_PATH = Path(__file__).resolve().parent.parent / "public" / "analogs" / "corpus.json"
MATCHES_PATH = Path(__file__).resolve().parent.parent / "public" / "analogs" / "matches.json"
ANALOGS_ROOT = CORPUS_PATH.parent
OUT_PATH = ANALOGS_ROOT / "corpus_validation.json"

DTW_EPSILON = 0.1
FLAT_THRESHOLD_ATR = 0.05
N_OPEN_BARS = 6
TOP_K = 5  # How many matches per query to consider — same default the UI uses.


def atr_proxy(highs: list[float], lows: list[float]) -> float:
    if not highs:
        return 0.0
    return sum(h - l for h, l in zip(highs, lows)) / len(highs)


def session_eod_atr(session: dict) -> float | None:
    closes = session.get("close", [])
    highs = session.get("high", [])
    lows = session.get("low", [])
    if len(closes) <= N_OPEN_BARS:
        return None
    atr = atr_proxy(highs, lows)
    if atr <= 0:
        return None
    anchor_close = closes[N_OPEN_BARS - 1]
    eod_close = closes[-1]
    return (eod_close - anchor_close) / atr


def dir_of(eod_atr: float) -> str:
    if eod_atr > FLAT_THRESHOLD_ATR:
        return "up"
    if eod_atr < -FLAT_THRESHOLD_ATR:
        return "down"
    return "flat"


def dtw_tier(dtw: float) -> str:
    if dtw < 1.5:
        return "tight"
    if dtw < 2.5:
        return "strong"
    if dtw < 3.5:
        return "solid"
    if dtw < 5.0:
        return "loose"
    return "reaching"


def binomial_pvalue(correct: int, n: int) -> float | None:
    """Two-sided normal-approx binomial test against p=0.5. Returns None
    when n < 20 (sample too small for the normal approx)."""
    if n < 20:
        return None
    p = correct / n
    sd = math.sqrt(0.25 / n)
    z = abs(p - 0.5) / sd if sd > 0 else 0
    # Two-sided p ≈ 2 * (1 − Φ(|z|)) via Abramowitz & Stegun.
    def phi(x: float) -> float:
        t = 1 / (1 + 0.2316419 * abs(x))
        d = 0.3989422804014327 * math.exp(-x * x / 2)
        prob_left = d * t * (
            0.319381530 + t * (
                -0.356563782 + t * (
                    1.781477937 + t * (-1.821255978 + t * 1.330274429)
                )
            )
        )
        return 1 - prob_left if x >= 0 else prob_left
    return max(0.0, min(1.0, 2 * (1 - phi(z))))


def load_session_for_slug(slug: str, inline_full: dict | None) -> dict | None:
    """Prefer the inline full_session field on the entry (the original
    43 strong-trend entries); else fall back to the per-slug session.json
    file the backfill writes."""
    if inline_full and inline_full.get("close"):
        return inline_full
    session_path = ANALOGS_ROOT / slug / "session.json"
    if session_path.exists():
        try:
            return json.loads(session_path.read_text())
        except Exception:
            return None
    return None


def main() -> int:
    print("Loading corpus and matches…")
    corpus = json.loads(CORPUS_PATH.read_text())
    matches = json.loads(MATCHES_PATH.read_text())
    entries = {e["slug"]: e for e in corpus["entries"]}
    matches_by_slug = matches["matches"]
    print(f"  {len(entries):,} sessions, {len(matches_by_slug):,} match-sets")

    # Pre-load session bars for all entries (used as both query EOD source
    # and match EOD source).
    print("Loading session bars for every entry…")
    sessions: dict[str, dict] = {}
    missing_session = 0
    for slug, entry in entries.items():
        s = load_session_for_slug(slug, entry.get("full_session"))
        if s is None:
            missing_session += 1
            continue
        sessions[slug] = s
    print(f"  loaded {len(sessions):,} session bundles, {missing_session} missing")

    # Walk each query, compute predicted + actual direction, log.
    observations: list[dict] = []
    skipped_no_query_session = 0
    skipped_insufficient_match_data = 0
    skipped_query_flat = 0
    skipped_predicted_flat = 0

    for slug, top_matches in matches_by_slug.items():
        query_session = sessions.get(slug)
        if query_session is None:
            skipped_no_query_session += 1
            continue
        actual_eod = session_eod_atr(query_session)
        if actual_eod is None:
            skipped_no_query_session += 1
            continue
        actual_dir = dir_of(actual_eod)

        # DTW-weighted vote across top-K matches that have loadable
        # session bars.
        weight_sum = 0.0
        weighted_eod_sum = 0.0
        weighted_vote = 0.0  # +w for up match outcome, -w for down
        used = 0
        sum_dtw = 0.0
        for m in top_matches[:TOP_K]:
            m_slug = m["slug"]
            m_session = sessions.get(m_slug)
            if m_session is None:
                continue
            m_eod = session_eod_atr(m_session)
            if m_eod is None:
                continue
            m_dtw = float(m["dtw"])
            w = 1 / (m_dtw + DTW_EPSILON)

            # If the match was flipped (vertical mirror), its outcome is
            # interpreted with sign flipped.
            if m.get("flipped"):
                m_eod = -m_eod

            weight_sum += w
            weighted_eod_sum += w * m_eod
            d = dir_of(m_eod)
            if d == "up":
                weighted_vote += w
            elif d == "down":
                weighted_vote -= w
            used += 1
            sum_dtw += m_dtw

        if used == 0 or weight_sum <= 0:
            skipped_insufficient_match_data += 1
            continue

        predicted_eod = weighted_eod_sum / weight_sum
        # 5% threshold to call directional vs tied (matches the live
        # accuracy API's threshold).
        vote_threshold = weight_sum * 0.05
        if weighted_vote > vote_threshold:
            predicted_dir = "up"
        elif weighted_vote < -vote_threshold:
            predicted_dir = "down"
        else:
            predicted_dir = "flat"

        if actual_dir == "flat":
            skipped_query_flat += 1
        if predicted_dir == "flat":
            skipped_predicted_flat += 1

        observations.append({
            "slug": slug,
            "ticker": entries[slug]["ticker"],
            "date": entries[slug]["date"],
            "month": entries[slug]["date"][:7],
            "actual_dir": actual_dir,
            "actual_eod_atr": round(actual_eod, 3),
            "predicted_dir": predicted_dir,
            "predicted_eod_atr": round(predicted_eod, 3),
            "matches_used": used,
            "mean_dtw": round(sum_dtw / used, 3) if used > 0 else 0.0,
            "tier": dtw_tier(sum_dtw / used) if used > 0 else "reaching",
        })

    print(f"\nUsable observations: {len(observations):,}")
    print(f"  skipped (no query session):     {skipped_no_query_session}")
    print(f"  skipped (no match data):        {skipped_insufficient_match_data}")
    print(f"  query was flat:                 {skipped_query_flat}")
    print(f"  predicted flat:                 {skipped_predicted_flat}")

    # Aggregate.
    def aggregate(obs: list[dict]) -> dict:
        graded = [o for o in obs if o["actual_dir"] != "flat" and o["predicted_dir"] != "flat"]
        if not graded:
            return {"n": 0, "graded": 0, "correct": 0, "hit_rate": None, "p_value": None}
        correct = sum(1 for o in graded if o["actual_dir"] == o["predicted_dir"])
        return {
            "n": len(obs),
            "graded": len(graded),
            "correct": correct,
            "hit_rate": round(correct / len(graded), 4),
            "p_value": binomial_pvalue(correct, len(graded)),
        }

    overall = aggregate(observations)
    print(f"\nOverall:")
    print(f"  n graded: {overall['graded']:,}")
    print(f"  correct:  {overall['correct']:,}")
    print(f"  hit rate: {overall['hit_rate']:.4f}" if overall['hit_rate'] is not None else "  hit rate: —")
    if overall['p_value'] is not None:
        print(f"  p-value:  {overall['p_value']:.6f}")

    # Slice by tier
    by_tier = defaultdict(list)
    for o in observations:
        by_tier[o["tier"]].append(o)
    tier_stats = {tier: aggregate(obs) for tier, obs in by_tier.items()}
    print(f"\nBy DTW tier:")
    for tier in ["tight", "strong", "solid", "loose", "reaching"]:
        if tier not in tier_stats:
            continue
        st = tier_stats[tier]
        rate = f"{st['hit_rate']:.3f}" if st['hit_rate'] is not None else "—"
        pv = f"p={st['p_value']:.4f}" if st['p_value'] is not None else "p=—"
        print(f"  {tier:9s} n={st['graded']:5d} correct={st['correct']:4d} hit={rate} {pv}")

    # Slice by predicted direction
    by_pred = defaultdict(list)
    for o in observations:
        by_pred[o["predicted_dir"]].append(o)
    pred_stats = {d: aggregate(obs) for d, obs in by_pred.items()}
    print(f"\nBy predicted direction:")
    for d in ["up", "down"]:
        if d not in pred_stats:
            continue
        st = pred_stats[d]
        rate = f"{st['hit_rate']:.3f}" if st['hit_rate'] is not None else "—"
        pv = f"p={st['p_value']:.4f}" if st['p_value'] is not None else "p=—"
        print(f"  {d:5s} n={st['graded']:5d} correct={st['correct']:4d} hit={rate} {pv}")

    # Slice by ticker
    by_ticker = defaultdict(list)
    for o in observations:
        by_ticker[o["ticker"]].append(o)
    ticker_stats = {t: aggregate(obs) for t, obs in by_ticker.items()}
    print(f"\nBy ticker (top 10 by N):")
    for ticker in sorted(ticker_stats.keys(),
                         key=lambda k: -ticker_stats[k]["graded"])[:10]:
        st = ticker_stats[ticker]
        rate = f"{st['hit_rate']:.3f}" if st['hit_rate'] is not None else "—"
        pv = f"p={st['p_value']:.4f}" if st['p_value'] is not None else "p=—"
        print(f"  {ticker:7s} n={st['graded']:5d} correct={st['correct']:4d} hit={rate} {pv}")

    # Slice by month
    by_month = defaultdict(list)
    for o in observations:
        by_month[o["month"]].append(o)
    month_stats = {m: aggregate(obs) for m, obs in by_month.items()}
    print(f"\nBy month:")
    for m in sorted(month_stats.keys()):
        st = month_stats[m]
        rate = f"{st['hit_rate']:.3f}" if st['hit_rate'] is not None else "—"
        pv = f"p={st['p_value']:.4f}" if st['p_value'] is not None else "p=—"
        print(f"  {m} n={st['graded']:5d} correct={st['correct']:4d} hit={rate} {pv}")

    # Output JSON for the site to consume.
    payload = {
        "generatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "topK": TOP_K,
        "totalObservations": len(observations),
        "overall": overall,
        "byTier": {
            tier: tier_stats[tier]
            for tier in ["tight", "strong", "solid", "loose", "reaching"]
            if tier in tier_stats
        },
        "byPredictedDirection": {
            d: pred_stats[d] for d in ["up", "down"] if d in pred_stats
        },
        "byTicker": {
            t: ticker_stats[t] for t in sorted(ticker_stats.keys(),
                                               key=lambda k: -ticker_stats[k]["graded"])
        },
        "byMonth": {m: month_stats[m] for m in sorted(month_stats.keys())},
    }
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"\nWrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
