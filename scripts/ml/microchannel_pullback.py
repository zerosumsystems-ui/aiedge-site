"""Microchannel-pullback refinement of the opening-spike setup.

The opening-spike setup (spike_detector.py) enters at the close of the
3rd spike bar — it CHASES the spike. Brooks teaches the opposite. A
spike is a microchannel, and the highest-probability with-trend entry
is the FIRST PULLBACK out of that microchannel, taken on a breakout
stop above the signal bar — an "H1" in a bull leg, an "L1" in a bear
leg (Trading Price Action: Trends, ch. on spikes and microchannels):

  "The first pullback in a spike is usually minor ... traders will buy
   the first pullback, expecting at least a measured move."

  "Place a buy stop at one tick above the high of the prior bar. When
   not filled, move the stop to the high of the next bar."

This module refines a detected spike into that trade. Given the spike
and the session's bars it:

  1. Treats the spike (plus any bars that keep extending the trend) as
     the microchannel leg.
  2. Finds the first pullback — the first bar that fails to extend the
     trend (no higher high in a bull / no lower low in a bear).
  3. Arms a with-trend breakout stop one tick past the signal bar's
     extreme. As the pullback deepens the stop trails to each
     successive bar; the entry fills on the first bar to trade through.

It is deliberately timeframe-agnostic — it takes a plain OHLC bar list,
so the SAME code finds the pullback on the 5-min spike bars or, when
1-minute history is available, on the 1-min bars inside the 5-min
spike. The caller decides what the bars are.

Pure functions only — no I/O, no market-data calls.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

# pullback_detector lives in scripts/live/ — reuse its minimal Bar shape.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from pullback_detector import Bar  # noqa: E402,F401 — shared OHLC bar shape


TICK = 0.01

# The first pullback out of a microchannel is tight. If the breakout
# stop has not filled within this many bars the pullback has become a
# deeper correction — no longer the H1/L1 entry this setup trades.
MAX_PULLBACK_BARS = 4


@dataclass(frozen=True)
class MicrochannelPullback:
    direction: str               # 'long' or 'short'
    lead_end_index: int          # last bar of the microchannel leg
    pullback_start_index: int    # first bar that failed to extend the trend
    signal_index: int            # last pullback bar — the H1/L1 signal bar
    pullback_bar_indices: tuple[int, ...]
    fire_index: int              # bar on which the breakout stop fills
    entry_price: float           # signal-bar high +1 tick (bull) / low -1 tick
    pullback_extreme: float      # lowest low (bull) / highest high of pullback
    micro_leg_height: float      # microchannel leg height (> 0)


def detect_microchannel_pullback(
    bars: Sequence[Bar],
    spike_start_index: int,
    spike_bar_count: int,
    direction: str,
) -> MicrochannelPullback | None:
    """Refine a detected spike into its first-pullback breakout entry.

    `bars` is any chronological OHLC series — the 5-min spike bars, or
    the 1-min bars inside the spike. The spike (caller-detected, via
    spike_detector.detect_spikes) is the microchannel leg; this finds
    the first pullback out of it and the with-trend breakout-stop entry.

    Returns None when the trend never pulls back before the data ends,
    the pullback never triggers a breakout within MAX_PULLBACK_BARS, or
    the pullback falls all the way back through the spike's origin
    (the microchannel is destroyed — no with-trend trade).
    """
    n = len(bars)
    if spike_bar_count < 1 or spike_start_index < 0:
        return None
    long = direction == "long"

    last_spike = spike_start_index + spike_bar_count - 1
    if last_spike >= n - 1:
        return None

    def extends(a: Bar, b: Bar) -> bool:
        return b.h > a.h if long else b.l < a.l

    # 1. The microchannel leg: the spike, plus any further bars that
    #    keep extending the trend. The pullback is the first bar that
    #    does not — the first bar with no higher high (bull).
    lead_end = last_spike
    i = lead_end + 1
    while i < n and extends(bars[i - 1], bars[i]):
        lead_end = i
        i += 1
    pullback_start = lead_end + 1
    if pullback_start >= n:
        return None

    spike_start = bars[spike_start_index]
    lead_bar = bars[lead_end]
    micro_leg = (lead_bar.h - spike_start.l) if long else (spike_start.h - lead_bar.l)
    if micro_leg <= 0:
        return None

    # 2. Walk the pullback. The breakout stop sits one tick past the
    #    most recent bar's extreme and trails with each pullback bar
    #    (Brooks: "move the stop to the high of the next bar"). It fills
    #    on the first bar to trade through.
    limit = min(n, pullback_start + 1 + MAX_PULLBACK_BARS)
    for k in range(pullback_start + 1, limit):
        signal = bars[k - 1]
        cur = bars[k]
        if long:
            entry = round(signal.h + TICK, 4)
            filled = cur.h >= entry
        else:
            entry = round(signal.l - TICK, 4)
            filled = cur.l <= entry
        if not filled:
            continue

        pb_indices = tuple(range(pullback_start, k))
        pb_bars = [bars[j] for j in pb_indices]
        if long:
            pb_extreme = min(b.l for b in pb_bars)
            erased = pb_extreme <= spike_start.l
        else:
            pb_extreme = max(b.h for b in pb_bars)
            erased = pb_extreme >= spike_start.h
        if erased:
            return None

        return MicrochannelPullback(
            direction=direction,
            lead_end_index=lead_end,
            pullback_start_index=pullback_start,
            signal_index=k - 1,
            pullback_bar_indices=pb_indices,
            fire_index=k,
            entry_price=entry,
            pullback_extreme=round(pb_extreme, 4),
            micro_leg_height=round(micro_leg, 4),
        )
    return None
