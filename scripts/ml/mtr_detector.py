"""Major trend reversal (MTR) detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Reversals) defines the major trend
reversal as a three-part sequence:

  "A major trend reversal needs a trendline break, then a test of the
   old extreme that fails (a lower high after a bull trend), and then
   the reversal."

Encoded mechanically: the session makes its high; price then breaks
structure (a pullback low that undercuts the prior swing low — the
trendline-break proxy); the market rallies back but only to a LOWER
high (the failed test); then a bar turns it down — the short. The
protective stop sits beyond that lower-high test; the measured move is
the distance from the old high to the structure-break low. A bear-trend
MTR mirrors it for longs.

This is a mechanical approximation of a nuanced Brooks pattern — the
trendline break is encoded as a swing-low undercut.

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
MTR_WINDOW = 40
MAX_PULLBACK_FROM_TEST = 6
EMA_SLOPE_LOOKBACK = 3


@dataclass(frozen=True)
class MtrSignal:
    direction: str
    timeframe: str
    fire_ts: int
    fire_index: int
    entry_price: float
    stop_price: float
    target_price: float
    move_height: float
    extreme_index: int
    test_index: int


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
                emas: list[float], timeframe: str) -> MtrSignal | None:
    cur, trig = bars[i], bars[i - 1]
    short = direction == "short"
    lo = max(0, i - 1 - MTR_WINDOW)

    if short:
        if cur.l >= trig.l:
            return None
        entry = round(trig.l - TICK, 4)
        # 1. the old trend extreme — the highest high in the window.
        hh = max(range(lo, i - 1), key=lambda j: bars[j].h)
        if hh <= lo or hh >= i - 3:
            return None
        # 2. the trendline break — a swing low after hh that undercuts
        #    the lowest low before hh.
        pre_low = min(bars[j].l for j in range(lo, hh + 1))
        break_low = min(bars[j].l for j in range(hh, i))
        if break_low >= pre_low:
            return None
        # 3. the failed test — a lower high after the break.
        peaks_after = _peaks(bars, hh + 1, i - 1)
        if not peaks_after:
            return None
        test = peaks_after[-1]
        if bars[test].h >= bars[hh].h:
            return None
        if i - 1 - test > MAX_PULLBACK_FROM_TEST:
            return None
        stop = round(bars[test].h + TICK, 4)
        if entry >= stop:
            return None
        height = bars[hh].h - break_low
        target = round(entry - height, 4)
        if emas[hh] <= emas[max(0, hh - EMA_SLOPE_LOOKBACK)]:
            return None
    else:
        if cur.h <= trig.h:
            return None
        entry = round(trig.h + TICK, 4)
        ll = min(range(lo, i - 1), key=lambda j: bars[j].l)
        if ll <= lo or ll >= i - 3:
            return None
        pre_high = max(bars[j].h for j in range(lo, ll + 1))
        break_high = max(bars[j].h for j in range(ll, i))
        if break_high <= pre_high:
            return None
        troughs_after = _troughs(bars, ll + 1, i - 1)
        if not troughs_after:
            return None
        test = troughs_after[-1]
        if bars[test].l <= bars[ll].l:
            return None
        if i - 1 - test > MAX_PULLBACK_FROM_TEST:
            return None
        stop = round(bars[test].l - TICK, 4)
        if entry <= stop:
            return None
        height = break_high - bars[ll].l
        target = round(entry + height, 4)
        if emas[ll] >= emas[max(0, ll - EMA_SLOPE_LOOKBACK)]:
            return None

    if height <= 0:
        return None
    return MtrSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        move_height=round(height, 4),
        extreme_index=(hh if short else ll), test_index=test,
    )


def detect_mtrs(bars: Sequence[Bar5m], timeframe: str = "") -> list[MtrSignal]:
    """Return every major-trend-reversal signal in `bars`."""
    n = len(bars)
    if n < EMA_LEN + 8:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[MtrSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("short", "long"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
