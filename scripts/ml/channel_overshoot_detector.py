"""Trend-channel-line overshoot reversal detector — faithful to Brooks.

Al Brooks (Trading Price Action: Reversals) treats an overshoot of the
trend channel line as a reversal cue:

  "When the market pokes above the trend channel line and then reverses,
   it is a sign that the trend is exhausting."

Encoded mechanically: two prior swing highs define the trend channel
line; a third push that closes the projected line is an overshoot. When
the bar after that push turns the market down, it is the short. The
protective stop sits beyond the overshoot push; the measured move is
the height of the move from the channel into the reversal. A bear
channel mirrors it for longs.

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
CHANNEL_WINDOW = 30
MAX_PULLBACK_FROM_P3 = 6
EMA_SLOPE_LOOKBACK = 3


@dataclass(frozen=True)
class ChannelOvershootSignal:
    direction: str
    timeframe: str
    fire_ts: int
    fire_index: int
    entry_price: float
    stop_price: float
    target_price: float
    move_height: float
    push_indices: tuple[int, int, int]


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
                emas: list[float], timeframe: str) -> ChannelOvershootSignal | None:
    cur, trig = bars[i], bars[i - 1]
    short = direction == "short"
    lo = max(0, i - 1 - CHANNEL_WINDOW)

    if short:
        if cur.l >= trig.l:
            return None
        entry = round(trig.l - TICK, 4)
        pivots = _peaks(bars, lo, i - 1)
        if len(pivots) < 3:
            return None
        p1, p2, p3 = pivots[-3], pivots[-2], pivots[-1]
        if not (bars[p1].h < bars[p2].h < bars[p3].h):
            return None
        # the channel line through p1, p2 — projected to p3.
        slope = (bars[p2].h - bars[p1].h) / (p2 - p1)
        line_at_p3 = bars[p2].h + slope * (p3 - p2)
        if bars[p3].h <= line_at_p3:
            return None                       # no overshoot
        if i - 1 - p3 > MAX_PULLBACK_FROM_P3:
            return None
        stop = round(bars[p3].h + TICK, 4)
        if entry >= stop:
            return None
        far = min(bars[j].l for j in range(p1, i))
        height = bars[p3].h - far
        target = round(entry - height, 4)
        if emas[p3] <= emas[max(0, p3 - EMA_SLOPE_LOOKBACK)]:
            return None
    else:
        if cur.h <= trig.h:
            return None
        entry = round(trig.h + TICK, 4)
        pivots = _troughs(bars, lo, i - 1)
        if len(pivots) < 3:
            return None
        p1, p2, p3 = pivots[-3], pivots[-2], pivots[-1]
        if not (bars[p1].l > bars[p2].l > bars[p3].l):
            return None
        slope = (bars[p2].l - bars[p1].l) / (p2 - p1)
        line_at_p3 = bars[p2].l + slope * (p3 - p2)
        if bars[p3].l >= line_at_p3:
            return None
        if i - 1 - p3 > MAX_PULLBACK_FROM_P3:
            return None
        stop = round(bars[p3].l - TICK, 4)
        if entry <= stop:
            return None
        far = max(bars[j].h for j in range(p1, i))
        height = far - bars[p3].l
        target = round(entry + height, 4)
        if emas[p3] >= emas[max(0, p3 - EMA_SLOPE_LOOKBACK)]:
            return None

    if height <= 0:
        return None
    return ChannelOvershootSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        move_height=round(height, 4), push_indices=(p1, p2, p3),
    )


def detect_channel_overshoots(bars: Sequence[Bar5m], timeframe: str = "") -> list[ChannelOvershootSignal]:
    """Return every trend-channel-line overshoot reversal in `bars`."""
    n = len(bars)
    if n < EMA_LEN + 6:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[ChannelOvershootSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("short", "long"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
