"""Inside-bar breakout detector — Brooks 'ii' / 'iii'.

Al Brooks (Trading Price Action: Trading Ranges; Reading Price Charts
Bar by Bar) calls two or more consecutive inside bars a breakout-mode
pattern:

  "An ii pattern is a two-bar pattern made of two consecutive inside
   bars... ii and iii patterns are breakout-mode setups; the market is
   likely to break out and the trader takes the breakout."

Encoded mechanically: an inside bar sits entirely within the prior
bar's range. An 'ii' is two consecutive inside bars; an 'iii' is three
or more. The trade is the with-trend breakout of the pattern — a stop
one tick beyond the last inside bar, the protective stop on the far
side of the pattern, a measured-move target of the leg into it. The EMA
must slope with the trend.

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
EMA_LEN = 20                 # trend-filter EMA
TICK = 0.01
LEG_LOOKBACK = 10            # bars used to measure the leg into the pattern
EMA_SLOPE_LOOKBACK = 3


@dataclass(frozen=True)
class IiSignal:
    direction: str            # 'long' or 'short' — the breakout direction
    timeframe: str
    fire_ts: int              # epoch of the breakout bar
    fire_index: int           # bar index of the breakout bar
    entry_price: float        # 1 tick beyond the last inside bar
    stop_price: float         # 1 tick beyond the far side of the pattern
    target_price: float       # entry + measured move (the leg into it)
    leg_height: float         # the leg into the pattern — measured move
    inside_count: int         # 2 for an ii, >= 3 for an iii
    signal_index: int         # the last inside bar (= fire_index - 1)


def _emas(bars: Sequence[Bar5m], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    for i, b in enumerate(bars):
        out.append(b.c if i == 0 else b.c * k + out[-1] * (1 - k))
    return out


def _inside(inner: Bar5m, outer: Bar5m) -> bool:
    return inner.h <= outer.h and inner.l >= outer.l


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                emas: list[float], timeframe: str) -> IiSignal | None:
    if i < 3:
        return None
    long = direction == "long"
    outer, mid, last = bars[i - 3], bars[i - 2], bars[i - 1]
    # the ii — two consecutive inside bars ending at the signal bar.
    if not (_inside(mid, outer) and _inside(last, mid)):
        return None

    cur = bars[i]
    if long:
        if cur.h <= last.h:
            return None
        entry = round(last.h + TICK, 4)
        stop = round(min(mid.l, last.l) - TICK, 4)
        if entry <= stop:
            return None
    else:
        if cur.l >= last.l:
            return None
        entry = round(last.l - TICK, 4)
        stop = round(max(mid.h, last.h) + TICK, 4)
        if entry >= stop:
            return None

    # count the run of inside bars (an iii is a stronger ii).
    inside_count = 2
    j = i - 3
    while j > 0 and _inside(bars[j], bars[j - 1]):
        inside_count += 1
        j -= 1

    # trend filter — the EMA slopes with the breakout direction.
    e_now = emas[i - 1]
    e_prev = emas[max(0, i - 1 - EMA_SLOPE_LOOKBACK)]
    if long and e_now <= e_prev:
        return None
    if not long and e_now >= e_prev:
        return None

    # the leg into the pattern — the measured move.
    lo = max(0, i - LEG_LOOKBACK)
    if long:
        origin = min(bars[j].l for j in range(lo, i))
        height = entry - origin
        target = round(entry + height, 4)
    else:
        origin = max(bars[j].h for j in range(lo, i))
        height = origin - entry
        target = round(entry - height, 4)
    if height <= 0:
        return None

    return IiSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        leg_height=round(height, 4), inside_count=inside_count,
        signal_index=i - 1,
    )


def detect_ii(bars: Sequence[Bar5m], timeframe: str = "") -> list[IiSignal]:
    """Return every ii / iii breakout signal in `bars`. One signal per
    qualifying breakout bar; long and short are both checked."""
    n = len(bars)
    if n < EMA_LEN + 4:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[IiSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("long", "short"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
