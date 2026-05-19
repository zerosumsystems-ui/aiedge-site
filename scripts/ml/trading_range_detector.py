"""Trading-range breakout detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Trading Ranges) describes the
trading-range breakout: price goes sideways in a range, then breaks
out, and the range often projects a measured move of its own height.

  "A breakout from a trading range frequently leads to a measured move
   equal to the height of the range."

Encoded mechanically: a window of RANGE_BARS bars whose net drift is
small relative to its height (a genuine range, not a trend), then a bar
that trades out of the range. The protective stop sits on the far side
of the range; the measured move equals the range height. Long and short
breakouts use identical mirrored rules.

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


TICK = 0.01
RANGE_BARS = 10              # the consolidation must be at least this wide
RANGE_TREND_FRAC = 0.5       # net drift may be at most this fraction of the
                             # range height — beyond that it is a trend


@dataclass(frozen=True)
class TradingRangeSignal:
    direction: str
    timeframe: str
    fire_ts: int
    fire_index: int
    entry_price: float
    stop_price: float
    target_price: float
    move_height: float        # the range height = the measured move
    range_start_index: int


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                timeframe: str) -> TradingRangeSignal | None:
    long = direction == "long"
    start = i - RANGE_BARS
    if start < 0:
        return None
    window = bars[start:i]
    rng_hi = max(b.h for b in window)
    rng_lo = min(b.l for b in window)
    height = rng_hi - rng_lo
    if height <= 0:
        return None
    # a genuine range — its net drift is small relative to its height.
    if abs(window[-1].c - window[0].o) > RANGE_TREND_FRAC * height:
        return None

    cur = bars[i]
    if long:
        if cur.h <= rng_hi:
            return None
        entry = round(rng_hi + TICK, 4)
        stop = round(rng_lo - TICK, 4)
        target = round(entry + height, 4)
    else:
        if cur.l >= rng_lo:
            return None
        entry = round(rng_lo - TICK, 4)
        stop = round(rng_hi + TICK, 4)
        target = round(entry - height, 4)

    return TradingRangeSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        move_height=round(height, 4), range_start_index=start,
    )


def detect_trading_range_breakouts(bars: Sequence[Bar5m], timeframe: str = "") -> list[TradingRangeSignal]:
    """Return every trading-range breakout signal in `bars`."""
    n = len(bars)
    if n < RANGE_BARS + 2:
        return []
    out: list[TradingRangeSignal] = []
    for i in range(RANGE_BARS, n):
        for direction in ("long", "short"):
            sig = _detect_one(bars, i, direction, timeframe)
            if sig is not None:
                out.append(sig)
    return out
