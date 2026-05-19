"""Wedge / three-push reversal detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Reversals) calls the wedge one of his
most reliable reversal patterns:

  "A wedge is a three-push pattern... each push extends a little
   further but with less strength. It is a reliable reversal setup."

Encoded mechanically: a bull wedge is three rising swing highs (push 1
< push 2 < push 3) with rising swing lows between them — a converging
upward structure that exhausts the trend. The trade is the reversal:
after the third push, a stop one tick beyond the bar that turns the
market down, the protective stop beyond push 3, a measured-move target
the height of the wedge. A bear wedge (three falling pushes) mirrors it.

A bull wedge produces a SHORT signal, a bear wedge a LONG signal —
identical mirrored rules.

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


# ----- pre-registered thresholds --------------------------------------
EMA_LEN = 20
TICK = 0.01
WEDGE_WINDOW = 30            # the three pushes must fit inside this span
MAX_PULLBACK_FROM_P3 = 6     # bars from push 3 to the reversal trigger
EMA_SLOPE_LOOKBACK = 3


@dataclass(frozen=True)
class WedgeSignal:
    direction: str            # 'short' (bull wedge) or 'long' (bear wedge)
    timeframe: str
    fire_ts: int
    fire_index: int           # the bar that triggers the reversal
    entry_price: float        # 1 tick beyond the trigger bar
    stop_price: float         # 1 tick beyond push 3
    target_price: float       # entry -/+ the wedge height
    wedge_height: float       # push 3 extreme to the wedge's far side
    push_indices: tuple[int, int, int]


def _emas(bars: Sequence[Bar5m], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    for i, b in enumerate(bars):
        out.append(b.c if i == 0 else b.c * k + out[-1] * (1 - k))
    return out


def _peaks(bars: Sequence[Bar5m], lo: int, hi: int) -> list[int]:
    """Local-high indices in [lo, hi) — a bar higher than both neighbours."""
    return [j for j in range(max(lo, 1), min(hi, len(bars) - 1))
            if bars[j].h > bars[j - 1].h and bars[j].h >= bars[j + 1].h]


def _troughs(bars: Sequence[Bar5m], lo: int, hi: int) -> list[int]:
    """Local-low indices in [lo, hi) — a bar lower than both neighbours."""
    return [j for j in range(max(lo, 1), min(hi, len(bars) - 1))
            if bars[j].l < bars[j - 1].l and bars[j].l <= bars[j + 1].l]


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                emas: list[float], timeframe: str) -> WedgeSignal | None:
    cur, trig = bars[i], bars[i - 1]
    short = direction == "short"           # a bull wedge reverses down
    lo = max(0, i - 1 - WEDGE_WINDOW)

    if short:
        # 1. reversal trigger — cur breaks below the prior bar's low.
        if cur.l >= trig.l:
            return None
        entry = round(trig.l - TICK, 4)
        # 2. three rising pushes up — the bull wedge.
        pushes = _peaks(bars, lo, i - 1)
        if len(pushes) < 3:
            return None
        p1, p2, p3 = pushes[-3], pushes[-2], pushes[-1]
        if not (bars[p1].h < bars[p2].h < bars[p3].h):
            return None
        # rising lows between the pushes — the converging wedge shape.
        low12 = min(bars[j].l for j in range(p1, p2 + 1))
        low23 = min(bars[j].l for j in range(p2, p3 + 1))
        if low23 <= low12:
            return None
        if i - 1 - p3 > MAX_PULLBACK_FROM_P3:
            return None
        stop = round(bars[p3].h + TICK, 4)
        if entry >= stop:
            return None
        wedge_far = min(bars[j].l for j in range(p1, i))
        height = bars[p3].h - wedge_far
        target = round(entry - height, 4)
        # the wedge exhausts a bull trend — EMA rising into push 3.
        if emas[p3] <= emas[max(0, p3 - EMA_SLOPE_LOOKBACK)]:
            return None
    else:
        if cur.h <= trig.h:
            return None
        entry = round(trig.h + TICK, 4)
        pushes = _troughs(bars, lo, i - 1)
        if len(pushes) < 3:
            return None
        p1, p2, p3 = pushes[-3], pushes[-2], pushes[-1]
        if not (bars[p1].l > bars[p2].l > bars[p3].l):
            return None
        high12 = max(bars[j].h for j in range(p1, p2 + 1))
        high23 = max(bars[j].h for j in range(p2, p3 + 1))
        if high23 >= high12:
            return None
        if i - 1 - p3 > MAX_PULLBACK_FROM_P3:
            return None
        stop = round(bars[p3].l - TICK, 4)
        if entry <= stop:
            return None
        wedge_far = max(bars[j].h for j in range(p1, i))
        height = wedge_far - bars[p3].l
        target = round(entry + height, 4)
        if emas[p3] >= emas[max(0, p3 - EMA_SLOPE_LOOKBACK)]:
            return None

    if height <= 0:
        return None
    return WedgeSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        wedge_height=round(height, 4), push_indices=(p1, p2, p3),
    )


def detect_wedges(bars: Sequence[Bar5m], timeframe: str = "") -> list[WedgeSignal]:
    """Return every wedge / three-push reversal signal in `bars`. One
    signal per qualifying trigger bar; bull and bear wedges both checked."""
    n = len(bars)
    if n < EMA_LEN + 6:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[WedgeSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("short", "long"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
