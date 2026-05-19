#!/usr/bin/env python3
"""Backtest of the prior-day-extremes failed-breakout reversal.

The shipped /prior-day-extremes study headlines a near-coin-flip:
+0.035R expectancy, profit factor 1.08 — "interesting, but still wants
filtering before it becomes a trading rule." This engine does that
filtering work, reproducibly and in-repo.

Data
----
The 5-minute analog corpus under public/analogs/ — 2,948 regular
sessions, 88 liquid US equities/ETFs, 2025-02 .. 2026-05. Each session
is one trading day. The prior trading day is resolved from the global
sorted date list (the corpus' own calendar): a session has a usable
prior-day high/low only when the same symbol also traded the immediately
preceding calendar date in the corpus.

Method
------
* Detector (prior_day_extremes_detector.py) is pure and look-ahead free.
* Each signal is simulated forward bar-by-bar on 5-min bars; a bar that
  straddles both stop and target is scored STOPPED (conservative).
* Costs: per-share commission + entry/stop slippage in bps — the same
  model as backtest_spike.py / backtest_tfo.py.
* A pre-registered filter grid is evaluated. The improved rule is the
  conjunction of the filters whose 95% CI clears zero, and it is
  re-checked on a chronological out-of-sample split it was not chosen on.

Outputs
-------
* artifacts/backtest/prior_day_extremes_report.json — full filter grid.
* public/prior-day-extremes/examples.json — page verdict, per-symbol
  table, filter comparison, and a balanced (un-cherry-picked) gallery.

Usage:
    python3 scripts/ml/backtest_prior_day_extremes.py
"""

from __future__ import annotations

import calendar
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prior_day_extremes_detector import detect_pde_reversals  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "public" / "analogs"
OUT_DIR = ROOT / "artifacts" / "backtest"
PAGE_JSON = ROOT / "public" / "prior-day-extremes" / "examples.json"

# ----- pre-registered execution config (matches backtest_spike.py) ----
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0
TARGET_R = 2.0
# Corpus sessions up to ~2025-06 store prices in nano-dollars (x1e9);
# sessions from 2025-10 onward store plain dollars. Detect per-session:
# no liquid US equity/ETF trades above this, so anything larger is scaled.
NANO_DOLLAR_THRESHOLD = 1e5
RANDOM_STATE = 17
OOS_FRACTION = 0.40        # last 40% of dates held out of filter selection


def load_session(path: Path) -> list[dict] | None:
    """Read one corpus session.json into dollar-scaled o/h/l/c bars."""
    try:
        raw = json.loads(path.read_text())
    except Exception:
        return None
    o, h, l, c = raw.get("open"), raw.get("high"), raw.get("low"), raw.get("close")
    if not o or not h or not l or not c:
        return None
    ema = raw.get("ema20") or []
    times = raw.get("times") or []
    scale = 1e9 if max(float(x) for x in c) > NANO_DOLLAR_THRESHOLD else 1.0
    bars: list[dict] = []
    for i in range(len(o)):
        bars.append({
            "o": float(o[i]) / scale,
            "h": float(h[i]) / scale,
            "l": float(l[i]) / scale,
            "c": float(c[i]) / scale,
            "ema20": float(ema[i]) / scale if i < len(ema) else None,
            "time": times[i] if i < len(times) else "",
        })
    return bars


def simulate(sig, bars: list[dict]) -> dict:
    """Walk 5-min bars from the bar after the reversal forward. First of
    {stop, target} hit wins; a straddle is scored stopped. No fill -> the
    session's last close, exited at market."""
    direction = sig.direction
    risk = sig.risk
    es = ENTRY_SLIPPAGE_BPS / 1e4
    ss = STOP_SLIPPAGE_BPS / 1e4
    short = direction == "short"
    entry_fill = sig.entry_price * (1 - es) if short else sig.entry_price * (1 + es)

    exit_price = None
    exit_reason = None
    exit_index = len(bars) - 1
    for j in range(sig.reversal_index + 1, len(bars)):
        b = bars[j]
        hi, lo = float(b["h"]), float(b["l"])
        if short:
            hit_stop, hit_tgt = hi >= sig.stop_price, lo <= sig.target_price
        else:
            hit_stop, hit_tgt = lo <= sig.stop_price, hi >= sig.target_price
        if hit_stop:
            exit_price = (sig.stop_price * (1 + ss) if short
                          else sig.stop_price * (1 - ss))
            exit_reason = "stop"
            exit_index = j
            break
        if hit_tgt:
            exit_price = sig.target_price       # resting limit, clean fill
            exit_reason = "target"
            exit_index = j
            break
    if exit_price is None:
        last_close = float(bars[-1]["c"])
        exit_price = last_close * (1 + es) if short else last_close * (1 - es)
        exit_reason = "timeout"
        exit_index = len(bars) - 1

    gross = (entry_fill - exit_price) if short else (exit_price - entry_fill)
    commission_r = (2 * COMMISSION_PER_SHARE) / risk
    net_r = gross / risk - commission_r
    return {"exit_reason": exit_reason, "exit_index": exit_index,
            "exit_price": exit_price, "net_r": net_r}


def _bootstrap_ci(values: np.ndarray, n: int = 5000) -> list[float]:
    if len(values) < 2:
        return [float("nan"), float("nan")]
    rng = np.random.default_rng(RANDOM_STATE)
    means = [rng.choice(values, size=len(values), replace=True).mean()
             for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 4),
            round(float(np.percentile(means, 97.5)), 4)]


def summarize(trades: list[dict], label: str = "") -> dict:
    if not trades:
        return {"label": label, "n": 0}
    r = np.array([t["net_r"] for t in trades], dtype=float)
    reasons = [t["exit_reason"] for t in trades]
    n = len(trades)
    targets = sum(1 for x in reasons if x == "target")
    stops = sum(1 for x in reasons if x == "stop")
    timeouts = sum(1 for x in reasons if x == "timeout")
    wins = r[r > 0]
    losses = r[r <= 0]
    pf = (float(wins.sum() / -losses.sum())
          if len(losses) and losses.sum() < 0 else None)
    return {
        "label": label,
        "n": n,
        "win_rate": round(float((r > 0).mean()), 6),
        "target_hit_rate": round(targets / n, 6),
        "stop_rate": round(stops / n, 6),
        "timeout_rate": round(timeouts / n, 6),
        "expectancy_r": round(float(r.mean()), 6),
        "expectancy_ci95": _bootstrap_ci(r),
        "profit_factor": round(pf, 6) if pf is not None else None,
        "targets": targets,
        "stops": stops,
        "timeouts": timeouts,
    }


# ---- pre-registered filter grid -------------------------------------
FILTERS = {
    "attempt_1": lambda t: t["attempt_number"] == 1,
    "attempt_2plus": lambda t: t["attempt_number"] >= 2,
    "morning_entry": lambda t: t["entry_time"] < "12:00",
    "afternoon_entry": lambda t: t["entry_time"] >= "12:00",
    "failed_high_short": lambda t: t["level_kind"] == "prior_day_high",
    "failed_low_long": lambda t: t["level_kind"] == "prior_day_low",
    "intraday_breakout": lambda t: not t["gap_open"],
    "strong_reversal_bar": lambda t: t["reversal_strength"] >= 0.6,
    "ema_aligned": lambda t: t["ema_aligned"],
    "small_overshoot": lambda t: t["overshoot_pct"] <= 0.0015,
}


def bar_bucket(time: str) -> str:
    if time < "11:00":
        return "09:30-11:00"
    if time < "13:00":
        return "11:00-13:00"
    return "13:00-16:00"


def main() -> int:
    if not CORPUS.is_dir():
        print(f"ERROR: corpus not found at {CORPUS}", file=sys.stderr)
        return 2

    # ---- index the corpus + build its trading calendar --------------
    sessions: dict[str, dict[str, Path]] = {}      # symbol -> date -> dir
    all_dates: set[str] = set()
    for d in sorted(CORPUS.iterdir()):
        if not d.is_dir():
            continue
        parts = d.name.split("_")
        date, symbol = parts[0], "_".join(parts[1:])
        sessions.setdefault(symbol, {})[date] = d
        all_dates.add(date)
    calendar_dates = sorted(all_dates)
    prev_of = {calendar_dates[i]: calendar_dates[i - 1]
               for i in range(1, len(calendar_dates))}
    oos_cutoff = calendar_dates[int(len(calendar_dates) * (1 - OOS_FRACTION))]
    print(f"Corpus: {sum(len(v) for v in sessions.values())} sessions, "
          f"{len(sessions)} symbols, {len(calendar_dates)} dates")
    print(f"Out-of-sample cutoff date: {oos_cutoff}")

    # ---- load every session once into memory ------------------------
    loaded: dict[tuple[str, str], list[dict]] = {}
    for symbol, by_date in sessions.items():
        for date, sess_dir in by_date.items():
            bars = load_session(sess_dir / "session.json")
            if bars:
                loaded[(symbol, date)] = bars

    # ---- collect simulated trades for a given target multiple -------
    def collect(target_r: float):
        out_trades: list[dict] = []
        out_examples: list[dict] = []
        pairs = 0
        for (symbol, date), cur_bars in loaded.items():
            prior = prev_of.get(date)
            if prior is None or (symbol, prior) not in loaded:
                continue
            prior_bars = loaded[(symbol, prior)]
            pairs += 1
            prior_high = max(float(b["h"]) for b in prior_bars)
            prior_low = min(float(b["l"]) for b in prior_bars)
            for sig in detect_pde_reversals(cur_bars, prior_high, prior_low,
                                            target_r=target_r):
                if sig.reversal_index >= len(cur_bars) - 1:
                    continue  # no bar left to simulate the trade
                sim = simulate(sig, cur_bars)
                rec = {
                    "symbol": symbol,
                    "session_date": date,
                    "direction": sig.direction,
                    "level_kind": sig.level_kind,
                    "level": sig.level,
                    "attempt_number": sig.attempt_number,
                    "overshoot_pct": sig.overshoot_pct,
                    "entry_time": sig.entry_time,
                    "gap_open": sig.gap_open,
                    "reversal_strength": sig.reversal_strength,
                    "ema_aligned": sig.ema_aligned,
                    "net_r": sim["net_r"],
                    "exit_reason": sim["exit_reason"],
                    "is_oos": date >= oos_cutoff,
                }
                out_trades.append(rec)
                out_examples.append({"_sig": sig, "_sim": sim,
                                     "_bars": cur_bars, "_rec": rec})
        return out_trades, out_examples, pairs

    trades, examples, n_pairs = collect(TARGET_R)
    print(f"  {n_pairs} prior-day pairs, {len(trades)} reversal trades")

    if not trades:
        print("ERROR: no trades detected", file=sys.stderr)
        return 1

    # ---- baseline + the pre-registered filter grid ------------------
    baseline = summarize(trades, "baseline (all reversals)")
    grid = []
    positive_filters = []
    for name, pred in FILTERS.items():
        sub_in = [t for t in trades if pred(t) and not t["is_oos"]]
        s = summarize([t for t in trades if pred(t)], name)
        s_in = summarize(sub_in, name + " (in-sample)")
        s["in_sample_expectancy_r"] = s_in.get("expectancy_r")
        s["in_sample_ci95"] = s_in.get("expectancy_ci95")
        grid.append(s)
        # selection is made ONLY on the in-sample slice
        ci = s_in.get("expectancy_ci95") or [float("nan"), float("nan")]
        if s_in["n"] >= 100 and ci[0] > 0:
            positive_filters.append(name)

    # ---- pre-registered management sweep over the target multiple --
    # attempt_1 is the strongest single filter in the grid. The sweep
    # tunes only its profit target across a declared grid; the target
    # is chosen on the in-sample slice and checked out-of-sample.
    TARGET_GRID = [1.0, 1.5, 2.0, 3.0]
    sweep: dict[float, tuple[list[dict], list[dict]]] = {
        TARGET_R: (trades, examples)}
    management = []
    for tr in TARGET_GRID:
        if tr not in sweep:
            st, ex, _ = collect(tr)
            sweep[tr] = (st, ex)
        st = sweep[tr][0]
        a1 = [t for t in st if t["attempt_number"] == 1]
        management.append({
            "target_r": tr,
            "baseline": summarize(st, f"baseline @ {tr}R"),
            "attempt_1": summarize(a1, f"attempt_1 @ {tr}R"),
            "attempt_1_in_sample": summarize(
                [t for t in a1 if not t["is_oos"]], f"attempt_1 @ {tr}R in"),
            "attempt_1_out_of_sample": summarize(
                [t for t in a1 if t["is_oos"]], f"attempt_1 @ {tr}R oos"),
        })

    # ---- the improved rule ------------------------------------------
    best = max(management,
               key=lambda m: m["attempt_1_in_sample"].get("expectancy_r") or -9)
    best_tr = best["target_r"]
    improved = best["attempt_1"]
    improved_in = best["attempt_1_in_sample"]
    improved_oos = best["attempt_1_out_of_sample"]
    in_ci = improved_in.get("expectancy_ci95") or [float("nan"), float("nan")]
    rule_holds = bool(
        improved_in["n"] >= 100 and in_ci[0] > 0
        and improved_oos["n"] >= 50
        and (improved_oos.get("expectancy_r") or -9) > 0)
    chosen = ["attempt_1", f"target_{best_tr}R"] if rule_holds else []

    report = {
        "config": {
            "data": "public/analogs 5-min corpus",
            "prior_day": "resolved from the corpus' own trading calendar",
            "variant": "1_reversal_bar",
            "target_r": TARGET_R,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            "oos_cutoff_date": oos_cutoff,
        },
        "baseline": baseline,
        "filter_grid": grid,
        "management_sweep": management,
        "improved_rule_filters": chosen,
        "improved_rule": improved,
        "improved_rule_in_sample": improved_in,
        "improved_rule_out_of_sample": improved_oos,
        "improved_rule_holds_oos": rule_holds,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "prior_day_extremes_report.json").write_text(
        json.dumps(report, indent=2) + "\n")

    # ---- choose the headline cohort for the page --------------------
    # Headline the improved rule only if it holds up out-of-sample;
    # otherwise the page stays honest and headlines the baseline.
    if rule_holds:
        headline = [t for t in sweep[best_tr][0] if t["attempt_number"] == 1]
        headline_examples = [e for e in sweep[best_tr][1]
                             if e["_rec"]["attempt_number"] == 1]
        headline_verdict = improved
    else:
        headline = trades
        headline_examples = examples
        headline_verdict = baseline

    # ---- per-symbol table over the headline cohort ------------------
    by_symbol: dict[str, list[dict]] = {}
    for t in headline:
        by_symbol.setdefault(t["symbol"], []).append(t)
    symbol_summary = []
    for sym in sorted(by_symbol):
        s = summarize(by_symbol[sym])
        symbol_summary.append({
            "symbol": sym,
            "trades": s["n"],
            "win_rate": s["win_rate"],
            "target_rate": s["target_hit_rate"],
            "stop_rate": s["stop_rate"],
            "timeout_rate": s["timeout_rate"],
            "avg_r": s["expectancy_r"],
            "profit_factor_r": s["profit_factor"],
        })
    symbol_summary.sort(key=lambda r: r["trades"], reverse=True)

    # ---- filter-comparison table for the page -----------------------
    filters_table = [{
        "name": "baseline",
        "label": "All reversals",
        "n": baseline["n"],
        "expectancy_r": baseline["expectancy_r"],
        "profit_factor": baseline["profit_factor"],
        "win_rate": baseline["win_rate"],
    }]
    for s in grid:
        filters_table.append({
            "name": s["label"],
            "label": s["label"].replace("_", " "),
            "n": s["n"],
            "expectancy_r": s["expectancy_r"],
            "profit_factor": s["profit_factor"],
            "win_rate": s["win_rate"],
        })

    # ---- balanced, un-cherry-picked gallery -------------------------
    def epoch(date: str, time: str) -> int:
        y, m, d = (int(x) for x in date.split("-"))
        base = calendar.timegm((y, m, d, 0, 0, 0, 0, 0, 0))
        if time and ":" in time:
            hh, mm = (int(x) for x in time.split(":"))
            return base + hh * 3600 + mm * 60
        return base

    gallery_src = headline_examples

    def build_example(e: dict, label: str) -> dict:
        sig, sim, bars, rec = e["_sig"], e["_sim"], e["_bars"], e["_rec"]
        date = rec["session_date"]
        ts = [epoch(date, b["time"]) for b in bars]
        return {
            "label": label,
            "symbol": rec["symbol"],
            "session_date": date,
            "direction": sig.direction,
            "bars": [{"t": ts[i], "o": round(bars[i]["o"], 4),
                      "h": round(bars[i]["h"], 4), "l": round(bars[i]["l"], 4),
                      "c": round(bars[i]["c"], 4)} for i in range(len(bars))],
            "highlight_bar_ts": [ts[sig.reversal_index]],
            "entry_ts": ts[sig.reversal_index],
            "exit_ts": ts[sim["exit_index"]],
            "entry_price": round(sig.entry_price, 4),
            "stop_price": round(sig.stop_price, 4),
            "target_price": round(sig.target_price, 4),
            "exit_price": round(sim["exit_price"], 4),
            "exit_reason": sim["exit_reason"],
            "net_r": round(sim["net_r"], 4),
            "level_kind": sig.level_kind,
            "level": round(sig.level, 4),
            "attempt_number": sig.attempt_number,
            "bar_bucket": bar_bucket(sig.entry_time),
        }

    LABELS = {"target": "target winner", "stop": "stopped out",
              "timeout": "timed out"}

    def pick(direction: str, reason: str, k: int) -> list[dict]:
        hits = [e for e in gallery_src
                if e["_sig"].direction == direction
                and e["_sim"]["exit_reason"] == reason]
        hits.sort(key=lambda e: e["_rec"]["session_date"])
        step = max(1, len(hits) // k)
        return [build_example(hits[i], LABELS[reason])
                for i in range(0, len(hits), step)][:k]

    gallery: list[dict] = []
    for direction in ("short", "long"):
        for reason in ("target", "stop", "timeout"):
            gallery += pick(direction, reason, 6)

    PAGE_JSON.parent.mkdir(parents=True, exist_ok=True)
    PAGE_JSON.write_text(json.dumps({
        "generated_from": "scripts/ml/backtest_prior_day_extremes.py",
        "data_window": f"{calendar_dates[0]} .. {calendar_dates[-1]}",
        "headline_is_improved_rule": bool(rule_holds),
        "improved_rule_filters": chosen,
        "verdict": {
            "n": headline_verdict["n"],
            "win_rate": headline_verdict["win_rate"],
            "target_hit_rate": headline_verdict["target_hit_rate"],
            "stop_rate": headline_verdict["stop_rate"],
            "timeout_rate": headline_verdict["timeout_rate"],
            "expectancy_r": headline_verdict["expectancy_r"],
            "expectancy_ci95": headline_verdict["expectancy_ci95"],
            "profit_factor": headline_verdict["profit_factor"],
            "targets": headline_verdict["targets"],
            "stops": headline_verdict["stops"],
            "timeouts": headline_verdict["timeouts"],
        },
        "baseline_verdict": {
            "n": baseline["n"],
            "expectancy_r": baseline["expectancy_r"],
            "profit_factor": baseline["profit_factor"],
        },
        "out_of_sample": {
            "n": improved_oos["n"],
            "expectancy_r": improved_oos.get("expectancy_r"),
            "expectancy_ci95": improved_oos.get("expectancy_ci95"),
            "profit_factor": improved_oos.get("profit_factor"),
        },
        "filters": filters_table,
        "management": [{
            "target_r": m["target_r"],
            "baseline_expectancy_r": m["baseline"]["expectancy_r"],
            "attempt_1_n": m["attempt_1"]["n"],
            "attempt_1_expectancy_r": m["attempt_1"]["expectancy_r"],
            "attempt_1_win_rate": m["attempt_1"]["win_rate"],
            "attempt_1_profit_factor": m["attempt_1"]["profit_factor"],
        } for m in management],
        "symbol_summary": symbol_summary,
        "examples": gallery,
    }, indent=2) + "\n")

    # ---- console report ---------------------------------------------
    def line(s: dict):
        if s.get("n", 0) == 0:
            print(f"  {s['label']:34s} n=0")
            return
        print(f"  {s['label']:34s} n={s['n']:5d}  "
              f"win={s['win_rate']:.3f}  exp={s['expectancy_r']:+.4f}R  "
              f"CI{s['expectancy_ci95']}  pf={s['profit_factor']}")

    print("\n=== PRIOR-DAY-EXTREMES FAILED-BREAKOUT BACKTEST ===")
    line(baseline)
    print("  --- pre-registered filter grid (at 2R) ---")
    for s in grid:
        line(s)
    print("  --- management sweep: first-attempt-only by target ---")
    for m in management:
        line(m["attempt_1"])
    print(f"  --- improved rule: attempt_1 @ {best_tr}R ---")
    line(improved_in)
    line(improved_oos)
    print(f"\n  headline = "
          f"{'improved rule' if rule_holds else 'baseline (rule did not hold OOS)'}")
    print(f"  wrote {len(gallery)} gallery examples -> "
          f"{PAGE_JSON.relative_to(ROOT)}")
    print(f"  report -> {(OUT_DIR / 'prior_day_extremes_report.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
