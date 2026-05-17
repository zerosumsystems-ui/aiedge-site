"""First-EMA-touch detector — the first pullback into the 10/20 EMA
after a small trend.

The setup the /ema-touches study showcases: a session opens, price puts
in a small with-trend leg (a run of bars closing on one side of a
sloping EMA), then pulls back and — for the FIRST time — a bar's range
reaches the EMA. That first-touch bar is the signal. The trade is
with-trend: a pullback to the EMA in an uptrend is a long.

This module encodes that mechanically and is deliberately a clean V1,
NOT a bit-for-bit copy of the original (Mac-only) study script. The
point of the rebuild is an auditable, no-look-ahead detector: a fire at
bar i uses only bars[:i + 1] and the EMA value at i, both of which a
trader knows once bar i has closed.

What defines the setup, all pre-registered (fixed before any results
seen) and expressed in bar-counts / ATR multiples so it is not tuned to
a price level:

  - trend: >= `trend_min_bars` consecutive bars closed on the trend
    side of the EMA, the EMA sloped that way, and price extended
    >= `trend_min_atr` * ATR away from the EMA ("a small trend").
  - touch: the first later bar whose low (long) / high (short) reaches
    the EMA, and which did NOT close decisively through it
    (a `touch_close_tol_atr` * ATR poke is allowed — Brooks pullbacks
    routinely overshoot the average intrabar).

One signal per session — the first qualifying touch in either
direction. Entry/stop are left to the caller's variant logic; the
detector reports the touch bar, the touch extreme, the ATR at the
touch, and the preceding trend leg (for measured-move targets).

The EMA itself is NOT computed here: it must be seeded with the prior
trading day's continuous closes (see scripts/build/render_full_sessions
.py — `ema_seeding = prior_trading_day_continuous`). The caller seeds it
and passes the per-bar series in.

Pure functions only — no Databento, no HTTP. Same Bar5m shape as
tfo_detector / spike_detector.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

# tfo_detector lives in scripts/live/ — add it to the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from tfo_detector import Bar5m  # noqa: E402,F401 — shared bar shape

TICK = 0.01


# ----- pre-registered thresholds (fixed before any results seen) ------


@dataclass(frozen=True)
class EmaTouchConfig:
    """Tunable thresholds. Defaults are deliberately conservative; the
    backtest sweeps `ema_len` (10 vs 20) per variant.
    """
    ema_len: int = 20               # trend-filter EMA period
    atr_len: int = 14               # ATR lookback for "small" sizing
    trend_min_bars: int = 3         # consecutive bars closed on the trend side
    trend_min_atr: float = 1.5      # ... and price extended >= this * ATR
    touch_close_tol_atr: float = 0.25  # touch bar may close this * ATR past EMA


@dataclass(frozen=True)
class EmaTouchSignal:
    direction: str            # 'long' or 'short'
    ema_len: int              # the EMA period this touch was found against
    touch_index: int          # bar index of the first-touch bar
    touch_ts: int             # epoch of the first-touch bar
    entry_price: float        # close of the touch bar — the trader acts on close
    touch_extreme: float      # touch bar low (long) / high (short)
    ema_at_touch: float       # EMA value at the touch bar
    atr_at_touch: float       # ATR at the touch bar (for ATR-stop variants)
    trend_start_index: int    # first bar of the preceding trend run
    trend_extreme: float      # trend's extreme high (long) / low (short)
    trend_height: float       # trend leg height — for measured-move targets


def _atrs(bars: Sequence[Bar5m], length: int) -> list[float]:
    """Rolling-mean ATR. Early bars use the partial window so the series
    is fully defined. Same shape as pullback_detector._atrs.
    """
    trs: list[float] = []
    for i, b in enumerate(bars):
        if i == 0:
            trs.append(b.h - b.l)
        else:
            pc = bars[i - 1].c
            trs.append(max(b.h - b.l, abs(b.h - pc), abs(b.l - pc)))
    out: list[float] = []
    for i in range(len(trs)):
        lo = max(0, i - length + 1)
        window = trs[lo:i + 1]
        out.append(sum(window) / len(window))
    return out


def _check_touch(
    bars: Sequence[Bar5m],
    ema: Sequence[float],
    atrs: list[float],
    i: int,
    direction: str,
    cfg: EmaTouchConfig,
) -> EmaTouchSignal | None:
    """Is bar `i` a first-touch of the EMA out of a small trend, in
    `direction`? Uses only bars[:i + 1]. Returns the signal or None.
    """
    long = direction == "long"
    atr = atrs[i]
    if atr <= 0:
        return None

    cur = bars[i]
    ema_i = ema[i]
    tol = cfg.touch_close_tol_atr * atr

    # 1. The touch: the bar's range reaches the EMA, and it did not
    #    close decisively through it (a small poke is allowed).
    if long:
        if cur.l > ema_i:
            return None
        if cur.c < ema_i - tol:
            return None
    else:
        if cur.h < ema_i:
            return None
        if cur.c > ema_i + tol:
            return None

    # 2. The preceding trend: walk back over the run of bars that closed
    #    on the trend side of the EMA.
    j = i - 1
    run = 0
    while j >= 0 and ((bars[j].c > ema[j]) if long else (bars[j].c < ema[j])):
        run += 1
        j -= 1
    if run < cfg.trend_min_bars:
        return None
    trend_start = j + 1

    # 3. EMA sloped with the trend across that run.
    if long:
        if ema[i - 1] <= ema[trend_start]:
            return None
    else:
        if ema[i - 1] >= ema[trend_start]:
            return None

    # 4. "Small trend": price extended a real distance away from the
    #    EMA — enough to be a leg, not just noise around the average.
    if long:
        trend_extreme = max(bars[k].h for k in range(trend_start, i))
        trend_low = min(bars[k].l for k in range(trend_start, i))
        extension = trend_extreme - ema[trend_start]
        trend_height = trend_extreme - trend_low
    else:
        trend_extreme = min(bars[k].l for k in range(trend_start, i))
        trend_high = max(bars[k].h for k in range(trend_start, i))
        extension = ema[trend_start] - trend_extreme
        trend_height = trend_high - trend_extreme
    if extension < cfg.trend_min_atr * atr:
        return None

    return EmaTouchSignal(
        direction=direction,
        ema_len=cfg.ema_len,
        touch_index=i,
        touch_ts=cur.t,
        entry_price=cur.c,
        touch_extreme=cur.l if long else cur.h,
        ema_at_touch=round(ema_i, 4),
        atr_at_touch=round(atr, 4),
        trend_start_index=trend_start,
        trend_extreme=round(trend_extreme, 4),
        trend_height=round(trend_height, 4),
    )


def detect_ema_touch(
    bars: Sequence[Bar5m],
    ema: Sequence[float],
    config: EmaTouchConfig | None = None,
) -> EmaTouchSignal | None:
    """Return the session's first EMA-touch signal, or None.

    `bars` and `ema` are parallel, chronological, and equal length —
    `ema` must already be seeded with the prior trading day's closes.
    Scans forward and returns the first qualifying touch in either
    direction; that "first" is the whole point of the study.
    """
    cfg = config or EmaTouchConfig()
    n = len(bars)
    if n != len(ema) or n <= cfg.trend_min_bars:
        return None
    atrs = _atrs(bars, cfg.atr_len)
    for i in range(cfg.trend_min_bars, n):
        for direction in ("long", "short"):
            sig = _check_touch(bars, ema, atrs, i, direction, cfg)
            if sig is not None:
                return sig
    return None
