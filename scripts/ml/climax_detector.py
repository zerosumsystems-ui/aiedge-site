"""Climax / exhaustion reversal detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Reversals) describes the climax: an
oversized bar (or run) to a new extreme that exhausts the trend and is
faded.

  "A climax is an extreme move that is unsustainable... it is often
   followed by a reversal or at least a trading range."

Encoded mechanically: within the recent window a bar runs at least
CLIMAX_MULT times the average bar range, closes strongly in the trend
direction, and makes a fresh extreme. When the next few bars turn the
market back, that is the fade. The protective stop sits beyond the
climax bar; the measured move is the climax bar's own range. A selling
climax mirrors it for longs.

Pure sliding-window function — live-replay safe. Same Bar5m shape.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from tfo_detector import Bar5m  # noqa: E402,F401 — shared bar shape


EMA_LEN = 20
TICK = 0.01
CLIMAX_WINDOW = 6            # the climax bar must be this recent
AVG_RANGE_BARS = 20          # bars used for the average-range baseline
CLIMAX_MULT = 2.0            # the climax bar runs this many average ranges
STRONG_CLOSE = 0.6           # the climax bar closes this far into its range
EMA_SLOPE_LOOKBACK = 3


@dataclass(frozen=True)
class ClimaxSignal:
    direction: str
    timeframe: str
    fire_ts: int
    fire_index: int
    entry_price: float
    stop_price: float
    target_price: float
    move_height: float
    climax_index: int


def _emas(bars: Sequence[Bar5m], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    for i, b in enumerate(bars):
        out.append(b.c if i == 0 else b.c * k + out[-1] * (1 - k))
    return out


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                emas: list[float], timeframe: str) -> ClimaxSignal | None:
    cur, trig = bars[i], bars[i - 1]
    short = direction == "short"             # a buying climax reverses down

    base_lo = max(0, i - 1 - AVG_RANGE_BARS)
    base = bars[base_lo:i - 1]
    if len(base) < 5:
        return None
    avg_range = sum(b.h - b.l for b in base) / len(base)
    if avg_range <= 0:
        return None

    # find a climax bar in the recent window.
    climax = None
    for j in range(max(1, i - 1 - CLIMAX_WINDOW), i):
        b = bars[j]
        rng = b.h - b.l
        if rng < CLIMAX_MULT * avg_range:
            continue
        prior = bars[base_lo:j]
        if not prior:
            continue
        if short:
            strong = b.c > b.o and (b.c - b.l) / rng >= STRONG_CLOSE
            new_extreme = b.h >= max(x.h for x in prior)
        else:
            strong = b.c < b.o and (b.h - b.c) / rng >= STRONG_CLOSE
            new_extreme = b.l <= min(x.l for x in prior)
        if strong and new_extreme:
            climax = j
    if climax is None:
        return None

    cb = bars[climax]
    if short:
        if cur.l >= trig.l:
            return None
        entry = round(trig.l - TICK, 4)
        stop = round(cb.h + TICK, 4)
        if entry >= stop:
            return None
        height = cb.h - cb.l
        target = round(entry - height, 4)
        if emas[climax] <= emas[max(0, climax - EMA_SLOPE_LOOKBACK)]:
            return None
    else:
        if cur.h <= trig.h:
            return None
        entry = round(trig.h + TICK, 4)
        stop = round(cb.l - TICK, 4)
        if entry <= stop:
            return None
        height = cb.h - cb.l
        target = round(entry + height, 4)
        if emas[climax] >= emas[max(0, climax - EMA_SLOPE_LOOKBACK)]:
            return None

    if height <= 0:
        return None
    return ClimaxSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        move_height=round(height, 4), climax_index=climax,
    )


def detect_climaxes(bars: Sequence[Bar5m], timeframe: str = "") -> list[ClimaxSignal]:
    """Return every climax / exhaustion reversal signal in `bars`."""
    n = len(bars)
    if n < EMA_LEN + AVG_RANGE_BARS + 2:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[ClimaxSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("short", "long"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
