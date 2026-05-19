#!/usr/bin/env python3
"""Pure detector for the prior-day-extremes failed-breakout reversal.

The setup: intraday price pokes through the prior regular-session high
(or low), fails to hold beyond that level, and the very next bar closes
back inside it. That next bar is the reversal-confirmation bar; the
trade fades the failed breakout (short a failed high poke, long a
failed low poke).

This is the "1_reversal_bar" variant that the shipped /prior-day-extremes
study headlines. The detector is a pure function with NO look-ahead: a
signal emitted at the reversal bar `r` reads only bars[:r+1]. Every
field needed to segment the trade later (attempt number, overshoot,
entry time, gap context, reversal-bar strength, EMA alignment) is
attached here so the backtest can filter without re-deriving anything.
"""

from __future__ import annotations

from dataclasses import dataclass

# A poke must clear the level by at least this fraction to count as a
# real breakout — screens out bars that merely tick the level by a cent.
MIN_OVERSHOOT_PCT = 0.0002


@dataclass
class PdeSignal:
    direction: str            # "long" | "short"
    level_kind: str           # "prior_day_high" | "prior_day_low"
    level: float
    breakout_index: int       # bar that poked through the level
    reversal_index: int       # bar that closed back inside (= entry bar)
    entry_price: float        # close of the reversal bar
    stop_price: float         # just beyond the breakout swing extreme
    target_price: float       # 2R from entry
    risk: float
    attempt_number: int       # 1 = first poke at this level this session
    overshoot_pct: float      # how far the poke cleared the level
    entry_time: str           # "HH:MM" of the reversal bar
    gap_open: bool            # session opened already beyond the level
    reversal_strength: float  # close position in the reversal bar's range
    ema_aligned: bool         # reversal close on the trade's side of EMA20


def _emit(
    bars: list[dict],
    direction: str,
    level_kind: str,
    level: float,
    bi: int,
    ri: int,
    attempt: int,
    target_r: float,
    stop_pad: float,
) -> PdeSignal | None:
    """Build a signal for a failed poke (breakout bar bi, reversal bar ri)."""
    entry = float(bars[ri]["c"])
    if direction == "short":
        swing = max(float(bars[bi]["h"]), float(bars[ri]["h"]))
        stop = swing * (1 + stop_pad)
        risk = stop - entry
        target = entry - target_r * risk
        overshoot = (float(bars[bi]["h"]) - level) / level
    else:
        swing = min(float(bars[bi]["l"]), float(bars[ri]["l"]))
        stop = swing * (1 - stop_pad)
        risk = entry - stop
        target = entry + target_r * risk
        overshoot = (level - float(bars[bi]["l"])) / level

    if risk <= 0:
        return None

    rng = float(bars[ri]["h"]) - float(bars[ri]["l"])
    if rng <= 0:
        strength = 0.0
    elif direction == "short":
        # strong = closes near the low of the reversal bar
        strength = (float(bars[ri]["h"]) - entry) / rng
    else:
        strength = (entry - float(bars[ri]["l"])) / rng

    ema = bars[ri].get("ema20")
    if ema is None:
        ema_aligned = False
    elif direction == "short":
        ema_aligned = entry < float(ema)
    else:
        ema_aligned = entry > float(ema)

    return PdeSignal(
        direction=direction,
        level_kind=level_kind,
        level=level,
        breakout_index=bi,
        reversal_index=ri,
        entry_price=entry,
        stop_price=stop,
        target_price=target,
        risk=risk,
        attempt_number=attempt,
        overshoot_pct=overshoot,
        entry_time=str(bars[ri].get("time", "")),
        gap_open=bi == 0,
        reversal_strength=strength,
        ema_aligned=ema_aligned,
    )


def detect_pde_reversals(
    bars: list[dict],
    prior_high: float,
    prior_low: float,
    target_r: float = 2.0,
    stop_pad: float = MIN_OVERSHOOT_PCT,
) -> list[PdeSignal]:
    """Find every 1-bar failed-breakout reversal of the prior-day extremes.

    `bars` is one regular session of 5-min bars, each a dict with
    o/h/l/c (floats, in dollars), optional `ema20` and `time`.
    A poke at bar i is a *fresh* breakout only when bar i-1 had not
    already cleared the level — so a multi-bar excursion counts once.
    The reversal bar must be the immediate next bar and must close back
    inside the level. Signals never read past their reversal bar.
    """
    n = len(bars)
    out: list[PdeSignal] = []
    if n < 3:
        return out

    high_attempt = 0
    low_attempt = 0
    for i in range(n - 1):
        hi = float(bars[i]["h"])
        lo = float(bars[i]["l"])

        # ---- failed breakout above the prior-day high -> short ----
        fresh_high = hi > prior_high and (
            i == 0 or float(bars[i - 1]["h"]) <= prior_high
        )
        if fresh_high and (hi - prior_high) / prior_high >= MIN_OVERSHOOT_PCT:
            high_attempt += 1
            if float(bars[i + 1]["c"]) < prior_high:
                sig = _emit(bars, "short", "prior_day_high", prior_high,
                            i, i + 1, high_attempt, target_r, stop_pad)
                if sig is not None:
                    out.append(sig)

        # ---- failed breakout below the prior-day low -> long ----
        fresh_low = lo < prior_low and (
            i == 0 or float(bars[i - 1]["l"]) >= prior_low
        )
        if fresh_low and (prior_low - lo) / prior_low >= MIN_OVERSHOOT_PCT:
            low_attempt += 1
            if float(bars[i + 1]["c"]) > prior_low:
                sig = _emit(bars, "long", "prior_day_low", prior_low,
                            i, i + 1, low_attempt, target_r, stop_pad)
                if sig is not None:
                    out.append(sig)

    return out
