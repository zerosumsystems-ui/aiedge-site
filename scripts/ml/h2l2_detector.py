"""High-2 / Low-2 pullback detector — faithful to Al Brooks.

Al Brooks (Trading Price Action: Trends; Reading Price Charts Bar by
Bar) calls the High-2 the most reliable with-trend buy in a bull trend,
and the Low-2 its mirror in a bear trend.

  "A High 1 is the first bar in a pullback in a bull trend or a bull
   leg whose high is above the high of the prior bar... If the market
   forms a second leg down, the first bar whose high goes above the
   high of the prior bar is a High 2."  (paraphrase of Brooks)

  "The High 2 ... is a great buy setup in a bull trend. It is the end
   of a two-legged pullback."

Encoded mechanically as a two-legged pullback inside a trend:

  - a swing extreme (the impulse top in a bull leg),
  - leg 1 against the trend,
  - the H1 / L1 — the first bar to poke past the prior bar's extreme
    (the first failed attempt to resume the trend),
  - leg 2 against the trend — a fresh push past the H1 / L1 extreme,
  - the breakout bar — price trades one tick past the prior bar (the
    H2 / L2 signal bar). That breakout is the SECOND attempt, so the
    pullback must hold exactly one earlier attempt (the H1 / L1).

Entry is a stop one tick beyond the signal bar; the protective stop is
one tick beyond the pullback's far extreme; the measured move is the
impulse leg into the swing. The EMA must slope with the trend.

Pure sliding-window function — live-replay safe: a fire at bar i uses
only bars[:i + 1]. Same Bar5m shape as the other detectors.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

# tfo_detector lives in scripts/live/ — add it to the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from tfo_detector import Bar5m  # noqa: E402,F401 — shared bar shape


# ----- pre-registered thresholds --------------------------------------
EMA_LEN = 20                 # trend-filter EMA
TICK = 0.01
MAX_PULLBACK_BARS = 12       # a pullback wider than this is a trend change
MIN_PULLBACK_BARS = 3        # leg 1 + the H1/L1 + leg 2 need at least 3 bars
EMA_SLOPE_LOOKBACK = 3       # bars used to measure the EMA's slope


@dataclass(frozen=True)
class H2L2Signal:
    direction: str            # 'long' (High 2) or 'short' (Low 2)
    timeframe: str
    fire_ts: int              # epoch of the breakout bar
    fire_index: int           # bar index of the breakout bar
    entry_price: float        # 1 tick beyond the H2/L2 signal bar
    stop_price: float         # 1 tick beyond the pullback's far extreme
    target_price: float       # entry + measured move (the impulse leg)
    impulse_height: float     # the impulse leg into the swing extreme
    h1_index: int             # the H1 / L1 bar (the first attempt)
    signal_index: int         # the H2 / L2 signal bar (= fire_index - 1)
    impulse_top_index: int    # the swing extreme the pullback hangs from
    pullback_bar_timestamps: tuple[int, ...] = field(default_factory=tuple)


def _emas(bars: Sequence[Bar5m], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    for i, b in enumerate(bars):
        out.append(b.c if i == 0 else b.c * k + out[-1] * (1 - k))
    return out


def _detect_one(bars: Sequence[Bar5m], i: int, direction: str,
                emas: list[float], timeframe: str) -> H2L2Signal | None:
    long = direction == "long"
    cur, sigbar = bars[i], bars[i - 1]

    # 1. the breakout — bar i trades past the signal bar's extreme.
    if long:
        if cur.h <= sigbar.h:
            return None
        entry = round(sigbar.h + TICK, 4)
    else:
        if cur.l >= sigbar.l:
            return None
        entry = round(sigbar.l - TICK, 4)

    # 2. the swing extreme the pullback hangs from.
    lo = max(0, i - 1 - MAX_PULLBACK_BARS)
    if long:
        imp_top = max(range(lo, i), key=lambda j: bars[j].h)
    else:
        imp_top = min(range(lo, i), key=lambda j: bars[j].l)
    pb = list(range(imp_top + 1, i))         # pullback bars, fire bar excluded
    if len(pb) < MIN_PULLBACK_BARS:
        return None
    # price must have stayed on the pullback side of the swing extreme.
    if long and any(bars[j].h >= bars[imp_top].h for j in pb):
        return None
    if not long and any(bars[j].l <= bars[imp_top].l for j in pb):
        return None

    # 3. count the attempts. An attempt = a bar poking past the prior
    #    bar's extreme. The H1/L1 is the first; the breakout (bar i) is
    #    the second, so the pullback must hold exactly one earlier one.
    if long:
        pokes = [j for j in pb if bars[j].h > bars[j - 1].h]
    else:
        pokes = [j for j in pb if bars[j].l < bars[j - 1].l]
    if len(pokes) != 1:
        return None
    h1 = pokes[0]
    if h1 <= imp_top or h1 >= i - 1:
        return None                           # need leg 1 before it, leg 2 after

    # 4. leg 2 — a genuine fresh push past the H1/L1 extreme.
    if long:
        leg2 = any(bars[j].l < bars[h1].l for j in range(h1 + 1, i))
    else:
        leg2 = any(bars[j].h > bars[h1].h for j in range(h1 + 1, i))
    if not leg2:
        return None

    # 5. structural stop — one tick beyond the pullback's far extreme.
    if long:
        pb_ext = min(bars[j].l for j in pb)
        stop = round(pb_ext - TICK, 4)
        if entry <= stop:
            return None
    else:
        pb_ext = max(bars[j].h for j in pb)
        stop = round(pb_ext + TICK, 4)
        if entry >= stop:
            return None

    # 6. trend filter — the EMA slopes with the trend into the swing.
    e_now = emas[imp_top]
    e_prev = emas[max(0, imp_top - EMA_SLOPE_LOOKBACK)]
    if long and e_now <= e_prev:
        return None
    if not long and e_now >= e_prev:
        return None

    # 7. the impulse leg into the swing extreme — the measured move.
    il = max(0, imp_top - MAX_PULLBACK_BARS)
    if long:
        origin = min(bars[j].l for j in range(il, imp_top + 1))
        height = bars[imp_top].h - origin
        target = round(entry + height, 4)
    else:
        origin = max(bars[j].h for j in range(il, imp_top + 1))
        height = origin - bars[imp_top].l
        target = round(entry - height, 4)
    if height <= 0:
        return None

    return H2L2Signal(
        direction=direction, timeframe=timeframe,
        fire_ts=cur.t, fire_index=i,
        entry_price=entry, stop_price=stop, target_price=target,
        impulse_height=round(height, 4),
        h1_index=h1, signal_index=i - 1, impulse_top_index=imp_top,
        pullback_bar_timestamps=tuple(bars[j].t for j in pb),
    )


def detect_h2l2(bars: Sequence[Bar5m], timeframe: str = "") -> list[H2L2Signal]:
    """Return every High-2 / Low-2 signal in `bars`. One signal per
    qualifying breakout bar; long and short are both checked."""
    n = len(bars)
    if n < EMA_LEN + MIN_PULLBACK_BARS + 2:
        return []
    emas = _emas(bars, EMA_LEN)
    out: list[H2L2Signal] = []
    for i in range(EMA_LEN, n):
        for direction in ("long", "short"):
            sig = _detect_one(bars, i, direction, emas, timeframe)
            if sig is not None:
                out.append(sig)
    return out
