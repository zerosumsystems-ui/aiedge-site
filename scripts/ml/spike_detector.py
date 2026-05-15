"""Opening-spike detector — faithful to Al Brooks' primary source.

Brooks (Trading Price Action: Trends, ch. 43) defines a spike:

  "Trends can be very steep, with a series of trend bars with large
   bodies, very little overlap between adjacent bars, and small tails.
   This is the spike phase of a trend."

And on trading it (verbatim):

  "Big traders don't hesitate to enter a trend during its spike phase
   ... buying at the market, buying a one- or two-tick pullback,
   buying above the prior bar on a stop ... they can buy the close of
   the bar that made them believe that the trend has begun."

  "The initial protective stop is one tick below the low of the spike."

  "Take the number of points from the open of the first bar of the
   spike to the close of the final bar of the spike and add that to
   the close of that final bar of the spike." (the measured move)

  "A strong breakout has at least a 60 percent chance of reaching a
   measured move approximately equal to the size of the spike."

This module encodes that mechanically. A spike = N>=3 consecutive
same-direction strong trend bars with little overlap. The detector
emits ONE signal per spike, at the 3rd bar (the first bar at which a
mechanical observer can know "this is a spike"). Entry is that bar's
close; stop is one tick beyond the spike's start; target is the
measured move (spike height) from entry.

Pure functions only — no Databento, no Supabase, no HTTP. Same
Bar5m shape as tfo_detector. Callers fetch + persist + backtest.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

# tfo_detector lives in scripts/live/ — add it to the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from tfo_detector import Bar5m  # noqa: E402,F401 — shared bar shape


# ----- pre-registered thresholds (fixed before any results seen) ------

MIN_SPIKE_BARS = 3            # Brooks: "as brief as ... " — 3 is the
                             # minimum at which a spike is identifiable.
STRONG_BODY_RATIO = 0.5      # body >= 50% of range — a trend bar with
                             # a "large body".
STRONG_CLOSE_POSITION = 0.75 # close in the top 25% (bull) / bottom 25%
                             # (bear) — "small tails", closes near the
                             # extreme.
MAX_OVERLAP_FRAC = 0.25      # "very little overlap": a spike bar's low
                             # (bull) may dip at most 25% of the prior
                             # bar's range below the prior bar's close.
OPENING_WINDOW_BARS = 6      # a spike whose first bar is within the
                             # first 6 RTH 5-min bars is an "opening
                             # spike" (Brooks' trend-from-the-open zone).
TICK = 0.01


@dataclass(frozen=True)
class SpikeSignal:
    direction: str            # 'long' or 'short'
    spike_start_index: int    # bar index of the 1st spike bar
    entry_index: int          # bar index of the 3rd spike bar (entry)
    entry_ts: int             # epoch of the entry (3rd-spike) bar
    entry_price: float        # close of the 3rd spike bar — Brooks: buy the close
    stop_price: float         # 1 tick beyond the spike's start extreme
    target_price: float       # entry + measured move (spike height)
    spike_height: float       # |close(3rd) - open(1st)| — Brooks' measured move
    spike_bar_count: int      # consecutive spike bars (>=3)
    is_opening: bool          # spike started within OPENING_WINDOW_BARS


def _body_ratio(b: Bar5m) -> float:
    rng = b.h - b.l
    if rng <= 0:
        return 0.0
    return abs(b.c - b.o) / rng


def _close_position(b: Bar5m) -> float:
    rng = b.h - b.l
    if rng <= 0:
        return 0.5
    return (b.c - b.l) / rng


def _is_strong_bull(b: Bar5m) -> bool:
    return (b.c > b.o
            and _body_ratio(b) >= STRONG_BODY_RATIO
            and _close_position(b) >= STRONG_CLOSE_POSITION)


def _is_strong_bear(b: Bar5m) -> bool:
    return (b.c < b.o
            and _body_ratio(b) >= STRONG_BODY_RATIO
            and _close_position(b) <= (1.0 - STRONG_CLOSE_POSITION))


def _little_overlap(prev: Bar5m, cur: Bar5m, direction: str) -> bool:
    """Brooks: 'very little overlap between adjacent bars.' For a bull
    spike, the current bar's low may dip at most MAX_OVERLAP_FRAC of the
    prior bar's range below the prior bar's CLOSE — the pullback into
    the prior bar stays shallow. Mirror for a bear spike."""
    prng = prev.h - prev.l
    if prng <= 0:
        return False
    tol = MAX_OVERLAP_FRAC * prng
    if direction == "long":
        return cur.l >= prev.c - tol
    return cur.h <= prev.c + tol


def _spike_run(bars: Sequence[Bar5m], start: int, direction: str) -> int:
    """Length of the consecutive strong-trend-bar run beginning at
    `start`, requiring each bar strong + little overlap with its
    predecessor. Returns the run length (0 if the start bar isn't a
    strong trend bar in `direction`)."""
    strong = _is_strong_bull if direction == "long" else _is_strong_bear
    if not strong(bars[start]):
        return 0
    n = 1
    i = start + 1
    while i < len(bars) and strong(bars[i]) and _little_overlap(bars[i - 1], bars[i], direction):
        n += 1
        i += 1
    return n


def detect_spikes(bars: Sequence[Bar5m]) -> list[SpikeSignal]:
    """Return all spike signals in this session's 5-min bars.

    One signal per spike, emitted at the 3rd consecutive spike bar.
    Non-overlapping: after a spike is found, scanning resumes past its
    last bar (a fresh spike needs a fresh run).
    """
    signals: list[SpikeSignal] = []
    i = 0
    while i < len(bars):
        run_long = _spike_run(bars, i, "long")
        run_short = _spike_run(bars, i, "short")
        run = max(run_long, run_short)
        if run >= MIN_SPIKE_BARS:
            direction = "long" if run_long >= run_short else "short"
            start = i
            entry_idx = i + MIN_SPIKE_BARS - 1   # 3rd bar (0-based +2)
            first = bars[start]
            entry_bar = bars[entry_idx]
            spike_bars = bars[start:start + run]

            if direction == "long":
                spike_low = min(b.l for b in spike_bars[:MIN_SPIKE_BARS])
                stop = spike_low - TICK
                spike_height = entry_bar.c - first.o
                target = entry_bar.c + spike_height
            else:
                spike_high = max(b.h for b in spike_bars[:MIN_SPIKE_BARS])
                stop = spike_high + TICK
                spike_height = first.o - entry_bar.c
                target = entry_bar.c - spike_height

            # Degenerate spikes (zero/negative height) are not tradable.
            if spike_height > 0:
                signals.append(SpikeSignal(
                    direction=direction,
                    spike_start_index=start,
                    entry_index=entry_idx,
                    entry_ts=entry_bar.t,
                    entry_price=entry_bar.c,
                    stop_price=round(stop, 4),
                    target_price=round(target, 4),
                    spike_height=round(spike_height, 4),
                    spike_bar_count=run,
                    is_opening=start < OPENING_WINDOW_BARS,
                ))
            i = start + run   # resume past this spike
        else:
            i += 1
    return signals
