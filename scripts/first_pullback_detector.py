"""First-pullback detector — faithful to Al Brooks' primary source.

This finds the Brooks "first pullback" entry that follows a spike: not
the spike itself (that is spike_detector.py, and it backtested as a
null), but the High 1 / Low 1 resumption entry on the FIRST pullback
after the spike. Every rule below is anchored to a verbatim passage
from Brooks, *Trading Price Action: Trading Ranges* — no invented
moving-average slopes or ATR multipliers.

THE PULLBACK (after a spike). Brooks, glossary, "breakout pullback":

  "A small pullback of one to about five bars that occurs within a few
   bars after a breakout. Since you see it as a pullback, you are
   expecting the breakout to resume and the pullback is a setup for
   that resumption."

  So the pullback is 1-to-~5 bars. A correction longer than that is no
  longer a breakout pullback — it is becoming a trading range — so the
  detector abandons the spike if no High 1 forms within 5 bars.

THE HIGH 1 (the entry bar). Brooks, Introduction, "Bar Counting Basics":

  "A reliable sign that a pullback in a bull trend or in a trading
   range has ended is when the current bar's high extends at least one
   tick above the high of the prior bar ... the first bar whose high is
   above the high of the prior bar is a high 1, and this ends the first
   leg ... this leg may become a small leg in a larger pullback ...
   [the first leg] can be as brief as that single bar."

  Mirror for a bear spike — Brooks: "the first bar with a low below the
  low of the prior bar is a low 1." So the pullback is >= 1 bar, and
  the High 1 / Low 1 is the first bar that resumes the trend by at
  least one tick.

ENTRY. Brooks, ch. 3:

  "Traders can buy at one tick above the high of the prior bar."

  The "prior bar" is the signal bar — the last bar of the pullback.
  Entry is a buy stop one tick above the signal bar's high (sell stop
  one tick below its low for a short). The High 1 bar IS the entry bar:
  by definition it trades through that level.

PROTECTIVE STOP. Brooks names two, and the detector carries both:

  - stop_pullback — Brooks, ch. 1 (the bar-20 High 1 example): "Their
    initial protective stop would have been below the most recent minor
    pullback." One tick beyond the pullback's own extreme. Tight.
  - stop_spike — Brooks, ch. 1, for a spike-phase entry: "the risk is
    to the bottom of the spike ... they put their protective stop at
    one tick below the low of the lowest bar in the bull spike." The
    breakout point — if price falls back through where the spike began,
    the premise is dead. Wider, and the same stop the /spikes setup uses.

  The first pullback is a spike-phase entry, so stop_spike is the
  faithful structural stop; the backtest scores both.

BREAKOUT INTACT. Brooks, ch. 3:

  "If the market pulls back for a few bars and does not retrace too
   much of the breakout bar, the odds of the breakout being successful
   are good ... the deeper the pullback, the more likely it is that
   the breakout will fail and the market will reverse."

  So if the pullback retraces below the spike's own origin, the
  breakout has failed and there is no first-pullback trade.

TARGET. Brooks, ch. 4, names TWO targets for a High 1 buy:

  "they will expect a high 1 buy setup to lead to at least a new high
   and probably a measured move up, based on the height of the bull
   spike."

  So the detector carries both, verbatim:
    - target_new_high: "at least a new high" — one tick beyond the
      spike's extreme (Brooks elsewhere: the first pullback "is usually
      followed by a test of the trend's extreme").
    - target_measured_move: "probably a measured move ... based on the
      height of the bull spike" — the spike's height projected from
      the spike extreme, the same height the /spikes page paints.

  The backtest scores both so the verdict does not hinge on a target
  choice that Brooks left as a range.

Pure functions only — no Databento, no Supabase, no HTTP. Builds on
detect_spikes(); callers fetch + persist + backtest.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from tfo_detector import Bar5m  # noqa: F401 — shared bar shape
from spike_detector import detect_spikes


# ----- pre-registered thresholds (fixed before any results seen) ------

MIN_PULLBACK_BARS = 1   # Brooks: the first leg "can be as brief as
                        # that single bar" — a one-bar pullback counts.
MAX_PULLBACK_BARS = 5   # Brooks, "breakout pullback": "one to about
                        # five bars." Longer = a range, not a pullback.
TICK = 0.01


@dataclass(frozen=True)
class FirstPullbackSignal:
    direction: str               # 'long' or 'short'
    spike_start_index: int       # 1st bar of the originating spike
    spike_end_index: int         # last bar of the originating spike
    pullback_start_index: int    # 1st pullback bar (spike_end + 1)
    signal_bar_index: int        # last pullback bar — the signal bar
    entry_index: int             # the High 1 / Low 1 bar (entry bar)
    entry_ts: int                # epoch of the High 1 / Low 1 bar
    entry_trigger: float         # 1 tick beyond the signal bar's extreme
    stop_pullback: float         # 1 tick beyond the pullback's extreme (tight)
    stop_spike: float            # 1 tick beyond the spike's start extreme
                                 # (the breakout point — wider, structural)
    target_new_high: float       # 1 tick beyond the spike extreme — Brooks'
                                 # "at least a new high"
    target_measured_move: float  # spike height projected from the spike
                                 # extreme — Brooks' "probably a measured move"
    spike_height: float          # the spike's height (its measured move)
    pullback_bar_count: int      # bars in the pullback (1..MAX_PULLBACK_BARS)
    signal_bar_with_body: bool   # signal bar closed in the trade's
                                 # direction — Brooks: "more reliable
                                 # when it has a bull body" (recorded,
                                 # NOT a filter — Brooks still enters
                                 # High 1s without one).
    is_opening: bool             # the originating spike was an opening spike


def _first_pullback_after(bars: Sequence[Bar5m], sp) -> FirstPullbackSignal | None:
    """The first-pullback signal that follows one detected spike, or
    None if no faithful first pullback forms."""
    direction = sp.direction
    spike_start = sp.spike_start_index
    spike_end = spike_start + sp.spike_bar_count - 1
    spike_bars = bars[spike_start:spike_end + 1]

    spike_high = max(b.h for b in spike_bars)
    spike_low = min(b.l for b in spike_bars)
    spike_height = spike_high - spike_low
    if spike_height <= 0:
        return None

    # Walk forward from the bar after the spike. Each bar that does NOT
    # resume the trend by a tick is a pullback bar; the first bar that
    # does is the High 1 (long) / Low 1 (short).
    pullback: list[int] = []
    h1_index: int | None = None
    i = spike_end + 1
    while i < len(bars):
        prev, cur = bars[i - 1], bars[i]
        if direction == "long":
            resumes = cur.h >= prev.h + TICK
        else:
            resumes = cur.l <= prev.l - TICK
        if resumes:
            if len(pullback) >= MIN_PULLBACK_BARS:
                h1_index = i
            # else: the spike simply continued — no pullback, no trade.
            break
        pullback.append(i)
        if len(pullback) > MAX_PULLBACK_BARS:
            return None   # correction outgrew a breakout pullback
        i += 1
    if h1_index is None:
        return None

    signal_bar = bars[h1_index - 1]
    entry_bar = bars[h1_index]
    pb_bars = [bars[k] for k in pullback]

    if direction == "long":
        pullback_extreme = min(b.l for b in pb_bars)
        if pullback_extreme < spike_low:
            return None   # breakout failed — pullback fell below the spike
        entry_trigger = round(signal_bar.h + TICK, 4)
        stop_pullback = round(pullback_extreme - TICK, 4)
        stop_spike = round(spike_low - TICK, 4)
        target_new_high = round(spike_high + TICK, 4)
        target_measured_move = round(spike_high + spike_height, 4)
        if not (target_new_high > entry_trigger > stop_pullback):
            return None
        if entry_bar.h < entry_trigger:
            return None   # High 1 bar never reached the entry — not tradable
        signal_bar_with_body = signal_bar.c > signal_bar.o
    else:
        pullback_extreme = max(b.h for b in pb_bars)
        if pullback_extreme > spike_high:
            return None   # breakout failed — pullback rose above the spike
        entry_trigger = round(signal_bar.l - TICK, 4)
        stop_pullback = round(pullback_extreme + TICK, 4)
        stop_spike = round(spike_high + TICK, 4)
        target_new_high = round(spike_low - TICK, 4)
        target_measured_move = round(spike_low - spike_height, 4)
        if not (target_new_high < entry_trigger < stop_pullback):
            return None
        if entry_bar.l > entry_trigger:
            return None
        signal_bar_with_body = signal_bar.c < signal_bar.o

    return FirstPullbackSignal(
        direction=direction,
        spike_start_index=spike_start,
        spike_end_index=spike_end,
        pullback_start_index=pullback[0],
        signal_bar_index=h1_index - 1,
        entry_index=h1_index,
        entry_ts=entry_bar.t,
        entry_trigger=entry_trigger,
        stop_pullback=stop_pullback,
        stop_spike=stop_spike,
        target_new_high=target_new_high,
        target_measured_move=target_measured_move,
        spike_height=round(spike_height, 4),
        pullback_bar_count=len(pullback),
        signal_bar_with_body=signal_bar_with_body,
        is_opening=sp.is_opening,
    )


def detect_first_pullbacks(bars: Sequence[Bar5m]) -> list[FirstPullbackSignal]:
    """Return every first-pullback signal in this session's 5-min bars.

    One signal per spike: the first High 1 (long) / Low 1 (short) that
    forms within MAX_PULLBACK_BARS of the spike's end.
    """
    signals: list[FirstPullbackSignal] = []
    for sp in detect_spikes(bars):
        sig = _first_pullback_after(bars, sp)
        if sig is not None:
            signals.append(sig)
    return signals
