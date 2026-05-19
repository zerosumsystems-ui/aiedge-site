"""Breakout-pullback detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Trends) calls the breakout pullback one
of the highest-probability with-trend entries:

  "After a strong breakout, the first pullback is usually a great entry
   in the direction of the breakout."

Encoded mechanically: a bar makes a fresh high above the prior several
bars' resistance (the breakout), the market pulls back for a few bars,
then a bar trades back above the prior bar's high — the with-trend
re-entry. The protective stop sits beyond the pullback low; the measured
move is the breakout leg. The short side mirrors it.

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
PB_MAX = 5                   # the pullback may run at most this many bars
BREAKOUT_LOOKBACK = 20       # the breakout high must clear this many bars
LEG_LOOKBACK = 15            # bars used to measure the breakout leg
EMA_SLOPE_LOOKBACK = 3


@dataclass(frozen=True)
class BreakoutPullbackSignal:
    direction: str
    timeframe: str
    fire_ts: int
    fire_index: int
    entry_price: float
    stop_price: float
    target_price: float
    move_height: float
    breakout_index: int


def _emas(bars: Sequence[Bar5m], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    for i, b in enumerate(bars):
        out.append(b.c if i == 0 else b.c * k + out[-1] * (1 - k))
    return out


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                emas: list[float], timeframe: str) -> BreakoutPullbackSignal | None:
    long = direction == "long"
    cur, trig = bars[i], bars[i - 1]

    # 1. the with-trend re-entry — cur trades past the prior bar.
    if long:
        if cur.h <= trig.h:
            return None
        entry = round(trig.h + TICK, 4)
    else:
        if cur.l >= trig.l:
            return None
        entry = round(trig.l - TICK, 4)

    # 2. walk back over the pullback to the breakout extreme.
    bp = i - 1
    while bp > 0 and (bars[bp].h <= bars[bp - 1].h if long
                      else bars[bp].l >= bars[bp - 1].l):
        bp -= 1
    pb_len = i - 1 - bp
    if not (1 <= pb_len <= PB_MAX):
        return None

    # 3. the breakout extreme must clear the prior resistance / support.
    lo = max(0, bp - BREAKOUT_LOOKBACK)
    prior = bars[lo:bp]
    if long:
        if not prior or bars[bp].h <= max(b.h for b in prior):
            return None
        pb_ext = min(bars[j].l for j in range(bp, i))
        stop = round(pb_ext - TICK, 4)
        if entry <= stop:
            return None
    else:
        if not prior or bars[bp].l >= min(b.l for b in prior):
            return None
        pb_ext = max(bars[j].h for j in range(bp, i))
        stop = round(pb_ext + TICK, 4)
        if entry >= stop:
            return None

    # 4. trend filter — the EMA slopes with the breakout.
    e_now = emas[bp]
    e_prev = emas[max(0, bp - EMA_SLOPE_LOOKBACK)]
    if long and e_now <= e_prev:
        return None
    if not long and e_now >= e_prev:
        return None

    # 5. the breakout leg — the measured move.
    il = max(0, bp - LEG_LOOKBACK)
    if long:
        origin = min(bars[j].l for j in range(il, bp + 1))
        height = bars[bp].h - origin
        target = round(entry + height, 4)
    else:
        origin = max(bars[j].h for j in range(il, bp + 1))
        height = origin - bars[bp].l
        target = round(entry - height, 4)
    if height <= 0:
        return None

    return BreakoutPullbackSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        move_height=round(height, 4), breakout_index=bp,
    )


def detect_breakout_pullbacks(bars: Sequence[Bar5m], timeframe: str = "") -> list[BreakoutPullbackSignal]:
    """Return every breakout-pullback signal in `bars`."""
    n = len(bars)
    if n < EMA_LEN + 6:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[BreakoutPullbackSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("long", "short"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
