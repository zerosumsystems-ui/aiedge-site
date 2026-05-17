"""High 2 / Low 2 detector — Brooks' single most-cited "best trade."

Brooks, "The Best Trades" (Reversals book): across nearly every worked
example the recurring best setup is the High 2 / Low 2 — "the best
trade was likely to be any high 2, especially near the moving average."

Bar counting, from the Trends-book glossary (verbatim):

  "the first bar whose high is above the high of the prior bar is a
   high 1 ... If the market does not turn into a bull swing and instead
   continues sideways or down, label the next occurrence of a bar with
   a high above the high of the prior bar as a high 2, ending the
   second leg."

So a High 2 is the SECOND higher-high breakout after a spike: the
pullback makes a higher high (the H1), the H1 fails to run and the
correction resumes (a lower high), then the next higher high is the
H2 — the entry. It is the two-legged ("ABC") pullback. Brooks: enter
"on a stop at one tick above the high 1 and high 2 setups."

This detector is the direct sibling of first_pullback_detector (which
emits the H1): same spike context, same structural stops, same Brooks
targets — so the H2 result is directly comparable to the H1 result.
The mirror for a bear spike is the Low 2.

Pure, hindsight-free: every field uses bars[: h2_index + 1] only.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from tfo_detector import Bar5m  # noqa: F401 — shared bar shape
from spike_detector import detect_spikes

# ----- pre-registered thresholds (fixed before any results seen) ------
MAX_SPAN = 12      # H2 must form within this many bars of the spike end
                   # (Brooks: a two-legged correction is "about 10 bars")
EMA_PERIOD = 20    # the moving average Brooks' charts use
TICK = 0.01


@dataclass(frozen=True)
class H2Signal:
    direction: str               # 'long' (High 2) or 'short' (Low 2)
    spike_start_index: int
    spike_end_index: int
    signal_bar_index: int        # bar before the H2/L2 bar
    entry_index: int             # the H2 / L2 bar (entry bar)
    entry_ts: int                # epoch of the H2 / L2 bar
    entry_trigger: float         # 1 tick beyond the signal bar's extreme
    stop_pullback: float         # 1 tick beyond the correction's extreme
    stop_spike: float            # 1 tick beyond the spike's start extreme
    target_measured_move: float  # spike height from the spike extreme.
                                 # (No "new high" target — unlike the H1,
                                 # the deeper H2 entry is often already
                                 # past the spike extreme.)
    spike_height: float
    pullback_bar_count: int      # bars in the two-legged correction
    reached_ema: bool            # the correction touched the 20-bar EMA
    is_opening: bool


def _ema(bars: Sequence[Bar5m]) -> list[float]:
    """Within-session 20-bar EMA of the close."""
    a = 2.0 / (EMA_PERIOD + 1)
    out: list[float] = []
    e = bars[0].c
    for b in bars:
        e = a * b.c + (1 - a) * e
        out.append(e)
    return out


def _h2_after(bars: Sequence[Bar5m], sp) -> H2Signal | None:
    """The High 2 / Low 2 that follows one spike, or None."""
    direction = sp.direction
    spike_start = sp.spike_start_index
    spike_end = spike_start + sp.spike_bar_count - 1
    spike_bars = bars[spike_start:spike_end + 1]
    spike_high = max(b.h for b in spike_bars)
    spike_low = min(b.l for b in spike_bars)
    spike_height = spike_high - spike_low
    if spike_height <= 0:
        return None

    # Bar-count to the SECOND higher high (long) / lower low (short).
    # A "resume" bar extends the trend by a tick; a "pause" bar does
    # not. An Hn is the first resume bar after >= 1 pause bar.
    hh_count = 0
    pause_since = False
    h2_index: int | None = None
    last = min(len(bars), spike_end + 1 + MAX_SPAN)
    for i in range(spike_end + 1, last):
        prev, cur = bars[i - 1], bars[i]
        if direction == "long":
            resume = cur.h >= prev.h + TICK
        else:
            resume = cur.l <= prev.l - TICK
        if resume:
            if pause_since:
                hh_count += 1
                pause_since = False
                if hh_count == 2:
                    h2_index = i
                    break
        else:
            pause_since = True
    if h2_index is None:
        return None

    signal_bar = bars[h2_index - 1]
    entry_bar = bars[h2_index]
    correction = bars[spike_end + 1:h2_index]
    if not correction:
        return None

    ema = _ema(bars[:h2_index + 1])

    if direction == "long":
        pullback_extreme = min(b.l for b in correction)
        if pullback_extreme < spike_low:
            return None                       # breakout failed
        entry_trigger = round(signal_bar.h + TICK, 4)
        stop_pullback = round(pullback_extreme - TICK, 4)
        stop_spike = round(spike_low - TICK, 4)
        target_measured_move = round(spike_high + spike_height, 4)
        if not (target_measured_move > entry_trigger > stop_pullback):
            return None
        if entry_bar.h < entry_trigger:
            return None
        reached_ema = any(
            correction[k].l <= ema[spike_end + 1 + k]
            for k in range(len(correction)))
    else:
        pullback_extreme = max(b.h for b in correction)
        if pullback_extreme > spike_high:
            return None
        entry_trigger = round(signal_bar.l - TICK, 4)
        stop_pullback = round(pullback_extreme + TICK, 4)
        stop_spike = round(spike_high + TICK, 4)
        target_measured_move = round(spike_low - spike_height, 4)
        if not (target_measured_move < entry_trigger < stop_pullback):
            return None
        if entry_bar.l > entry_trigger:
            return None
        reached_ema = any(
            correction[k].h >= ema[spike_end + 1 + k]
            for k in range(len(correction)))

    return H2Signal(
        direction=direction,
        spike_start_index=spike_start,
        spike_end_index=spike_end,
        signal_bar_index=h2_index - 1,
        entry_index=h2_index,
        entry_ts=entry_bar.t,
        entry_trigger=entry_trigger,
        stop_pullback=stop_pullback,
        stop_spike=stop_spike,
        target_measured_move=target_measured_move,
        spike_height=round(spike_height, 4),
        pullback_bar_count=len(correction),
        reached_ema=bool(reached_ema),
        is_opening=sp.is_opening,
    )


def detect_h2(bars: Sequence[Bar5m]) -> list[H2Signal]:
    """Every High 2 / Low 2 signal in this session's 5-min bars — one
    per spike (the first two-legged-pullback resumption after it)."""
    out: list[H2Signal] = []
    for sp in detect_spikes(bars):
        sig = _h2_after(bars, sp)
        if sig is not None:
            out.append(sig)
    return out
