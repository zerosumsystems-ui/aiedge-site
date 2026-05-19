"""Double-top / double-bottom reversal detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Reversals) treats the double top and
double bottom as trading-range reversal patterns: two tests of roughly
the same extreme that fail, then a reversal.

  "A double top is two pushes up to about the same price... if the
   second fails, the market often reverses down."

Encoded mechanically: two swing highs at roughly the same level (within
a tolerance of the pattern's height) with a pullback between them, then
a bar that breaks below the prior bar's low triggers the short. The
protective stop sits beyond the higher of the two tops; the measured
move is the pattern's height (top to the intervening trough). The
double bottom mirrors it for longs.

Pure sliding-window function — live-replay safe: a fire at bar i uses
only bars[:i + 1]. Same Bar5m shape as the other detectors.
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
DT_WINDOW = 30               # the two tops must fit inside this span
MAX_PULLBACK_FROM_P2 = 6     # bars from the 2nd top to the reversal trigger
EQUAL_TOL_FRAC = 0.30        # the two tops are "equal" within this
                             # fraction of the pattern height
EMA_SLOPE_LOOKBACK = 3


@dataclass(frozen=True)
class DoubleTopSignal:
    direction: str            # 'short' (double top) or 'long' (double bottom)
    timeframe: str
    fire_ts: int
    fire_index: int
    entry_price: float
    stop_price: float
    target_price: float
    move_height: float        # the measured move — the pattern height
    extreme_indices: tuple[int, int]


def _emas(bars: Sequence[Bar5m], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    for i, b in enumerate(bars):
        out.append(b.c if i == 0 else b.c * k + out[-1] * (1 - k))
    return out


def _peaks(bars: Sequence[Bar5m], lo: int, hi: int) -> list[int]:
    return [j for j in range(max(lo, 1), min(hi, len(bars) - 1))
            if bars[j].h > bars[j - 1].h and bars[j].h >= bars[j + 1].h]


def _troughs(bars: Sequence[Bar5m], lo: int, hi: int) -> list[int]:
    return [j for j in range(max(lo, 1), min(hi, len(bars) - 1))
            if bars[j].l < bars[j - 1].l and bars[j].l <= bars[j + 1].l]


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                emas: list[float], timeframe: str) -> DoubleTopSignal | None:
    cur, trig = bars[i], bars[i - 1]
    short = direction == "short"
    lo = max(0, i - 1 - DT_WINDOW)

    if short:
        if cur.l >= trig.l:
            return None
        entry = round(trig.l - TICK, 4)
        peaks = _peaks(bars, lo, i - 1)
        if len(peaks) < 2:
            return None
        p1, p2 = peaks[-2], peaks[-1]
        trough = min(bars[j].l for j in range(p1, p2 + 1))
        top = max(bars[p1].h, bars[p2].h)
        height = top - trough
        if height <= 0:
            return None
        if abs(bars[p2].h - bars[p1].h) > EQUAL_TOL_FRAC * height:
            return None
        if i - 1 - p2 > MAX_PULLBACK_FROM_P2:
            return None
        stop = round(top + TICK, 4)
        if entry >= stop:
            return None
        target = round(entry - height, 4)
        if emas[p1] <= emas[max(0, p1 - EMA_SLOPE_LOOKBACK)]:
            return None
    else:
        if cur.h <= trig.h:
            return None
        entry = round(trig.h + TICK, 4)
        troughs = _troughs(bars, lo, i - 1)
        if len(troughs) < 2:
            return None
        p1, p2 = troughs[-2], troughs[-1]
        peak = max(bars[j].h for j in range(p1, p2 + 1))
        bottom = min(bars[p1].l, bars[p2].l)
        height = peak - bottom
        if height <= 0:
            return None
        if abs(bars[p2].l - bars[p1].l) > EQUAL_TOL_FRAC * height:
            return None
        if i - 1 - p2 > MAX_PULLBACK_FROM_P2:
            return None
        stop = round(bottom - TICK, 4)
        if entry <= stop:
            return None
        target = round(entry + height, 4)
        if emas[p1] >= emas[max(0, p1 - EMA_SLOPE_LOOKBACK)]:
            return None

    return DoubleTopSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        move_height=round(height, 4), extreme_indices=(p1, p2),
    )


def detect_double_tops(bars: Sequence[Bar5m], timeframe: str = "") -> list[DoubleTopSignal]:
    """Return every double-top / double-bottom reversal signal in `bars`."""
    n = len(bars)
    if n < EMA_LEN + 6:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[DoubleTopSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("short", "long"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
