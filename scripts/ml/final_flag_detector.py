"""Final-flag reversal detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Trends) describes the final flag: a
small pause near the end of an extended trend whose breakout fails and
becomes the start of the reversal.

  "A final flag is a flag that comes at the end of a trend. The breakout
   from it fails, and the failed breakout becomes a reversal."

Encoded mechanically: an extended bull run (the EMA well below price
over a long window), a tight FLAG_BARS-bar flag, a final push to a new
high just beyond the flag, then a bar that turns the market down — the
short. The protective stop sits above the final push; the measured move
is the height of the final push above the flag plus the flag itself. A
bear-trend final flag mirrors it for longs.

This is a mechanical approximation of a nuanced Brooks pattern.

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
RUN_BARS = 20                # the extended trend is measured over this span
FLAG_BARS = 4                # the flag is this many bars of tight pause
FLAG_TIGHT_FRAC = 0.6        # flag height <= this fraction of the run leg
MAX_PUSH_BARS = 4            # the final push past the flag is this brief


@dataclass(frozen=True)
class FinalFlagSignal:
    direction: str
    timeframe: str
    fire_ts: int
    fire_index: int
    entry_price: float
    stop_price: float
    target_price: float
    move_height: float
    flag_start_index: int


def _emas(bars: Sequence[Bar5m], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    for i, b in enumerate(bars):
        out.append(b.c if i == 0 else b.c * k + out[-1] * (1 - k))
    return out


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                emas: list[float], timeframe: str) -> FinalFlagSignal | None:
    long_trend = direction == "short"        # a bull final flag reverses down
    cur, trig = bars[i], bars[i - 1]
    push_lo = i - 1 - MAX_PUSH_BARS
    flag_lo = push_lo - FLAG_BARS
    run_lo = flag_lo - RUN_BARS
    if run_lo < 0:
        return None

    flag = bars[flag_lo:push_lo]
    run = bars[run_lo:flag_lo]
    flag_hi = max(b.h for b in flag)
    flag_lo_px = min(b.l for b in flag)
    flag_height = flag_hi - flag_lo_px
    run_leg = max(b.h for b in run) - min(b.l for b in run)
    if run_leg <= 0 or flag_height > FLAG_TIGHT_FRAC * run_leg:
        return None                          # the flag is not tight

    if long_trend:
        # an extended bull run into the flag.
        if emas[flag_lo] <= emas[run_lo]:
            return None
        # the final push makes a new high beyond the flag.
        push = bars[push_lo:i]
        push_hi = max(b.h for b in push)
        if push_hi <= flag_hi:
            return None
        # the reversal trigger turns the market down.
        if cur.l >= trig.l:
            return None
        entry = round(trig.l - TICK, 4)
        stop = round(push_hi + TICK, 4)
        if entry >= stop:
            return None
        height = push_hi - flag_lo_px
        target = round(entry - height, 4)
    else:
        if emas[flag_lo] >= emas[run_lo]:
            return None
        push = bars[push_lo:i]
        push_lo_px = min(b.l for b in push)
        if push_lo_px >= flag_lo_px:
            return None
        if cur.h <= trig.h:
            return None
        entry = round(trig.h + TICK, 4)
        stop = round(push_lo_px - TICK, 4)
        if entry <= stop:
            return None
        height = flag_hi - push_lo_px
        target = round(entry + height, 4)

    if height <= 0:
        return None
    return FinalFlagSignal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        move_height=round(height, 4), flag_start_index=flag_lo,
    )


def detect_final_flags(bars: Sequence[Bar5m], timeframe: str = "") -> list[FinalFlagSignal]:
    """Return every final-flag reversal signal in `bars`."""
    n = len(bars)
    if n < EMA_LEN + RUN_BARS + FLAG_BARS + MAX_PUSH_BARS + 2:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[FinalFlagSignal] = []
    for i in range(EMA_LEN, n):
        for direction in ("short", "long"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
