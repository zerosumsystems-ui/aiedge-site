"""Small-pullback pattern detector (Brooks with-trend pullback).

Finds the setup Al Brooks describes for small pullbacks: a strong
impulse leg, then a brief shallow pullback, then a with-trend
*prior-bar breakout-stop* entry — price trades one tick past the prior
bar's extreme, which is where the resting stop order fills.

Source material (public/brooks-tour, quoting the Brooks books):

  - "Traders would place a buy stop above its high. When not filled,
     they would move the stop to the high of the next bar..."
     (Fig 2.7, Reading Price Charts Bar by Bar)
  - "A bar with no tail at either end in a strong trend is a sign of
     strength, and traders should enter with trend on its breakout."
     (Fig 6.13/6.14, Trading Price Action Trends)

Unlike tfo_detector, this is NOT session-anchored. It is a pure
sliding-window function over an arbitrary list of OHLC bars, so the
SAME code finds small pullbacks on 1-min, 5-min, 15-min, or daily
bars — the caller decides what the bars are. `timeframe` is carried
through to the signal purely as a label.

Everything that defines "small" is measured in bar-counts and ATR
multiples, never in wall-clock time or absolute dollars, which is what
keeps the detector timeframe-agnostic:

  - impulse strength: leg height >= `impulse_min_atr` * ATR
  - pullback "small": <= `pullback_max_bars` bars AND retraces no more
    than `pullback_max_retrace` of the impulse AND holds the EMA.

Live-replay safe: a fire at bar i uses ONLY bars[:i + 1]. The detector
emits the same signals whether fed a streaming bars-so-far buffer or a
full historical array.

Scoring is small and deliberately stable for V1:

    score = impulse_atr + (1 - retrace) * 2 + (pullback_max_bars - len + 1) * 0.5

so a strong impulse with a shallow, brief pullback outranks a marginal
one, and downstream UI can sort by score.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence


@dataclass(frozen=True)
class Bar:
    """Minimal OHLCV bar. Timeframe-agnostic.

    `t` is the bar-open epoch (seconds, UTC). Callers must hand bars in
    chronological order with no gaps.
    """
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0


@dataclass(frozen=True)
class PullbackConfig:
    """Tunable thresholds. Defaults are timeframe-agnostic because every
    value is a bar-count or an ATR multiple, never a clock or a dollar
    amount. Callers may override per timeframe if they wish.
    """
    ema_len: int = 20             # trend-filter EMA
    atr_len: int = 14             # ATR lookback for "small" sizing
    impulse_min_bars: int = 3     # impulse leg must run at least this many bars
    impulse_min_atr: float = 2.0  # ... and cover at least this * ATR
    pullback_min_bars: int = 1    # pullback must be at least this many bars
    pullback_max_bars: int = 4    # ... and at most this many ("small")
    pullback_max_retrace: float = 0.5   # ... retracing <= this fraction of impulse
    ema_tolerance_atr: float = 0.75     # pullback may poke this * ATR past the EMA


@dataclass(frozen=True)
class PullbackSignal:
    direction: str          # 'long' or 'short'
    timeframe: str          # caller-supplied label ('1m', '5m', ...)
    fire_ts: int            # epoch seconds of the breakout-stop fire bar
    fire_index: int         # bar index (0-based) of the fire bar
    entry_price: float      # prior bar's extreme — where the stop fills
    stop_price: float       # protective stop — the pullback's far side
    impulse_atr: float      # impulse leg height, in ATR multiples
    pullback_len: int       # number of bars in the pullback
    retrace: float          # pullback depth / impulse height (0..1)
    score: float
    impulse_start_ts: int   # epoch seconds of the impulse origin bar
    impulse_top_ts: int     # epoch seconds of the impulse extreme bar
    # Epoch seconds of every bar inside the pullback, so the chart
    # paints exactly the bars the detector counted (no JS re-derivation).
    pullback_bar_timestamps: tuple[int, ...] = field(default_factory=tuple)


def _emas(bars: Sequence[Bar], length: int) -> list[float]:
    k = 2.0 / (length + 1)
    out: list[float] = []
    ema = bars[0].c
    for i, b in enumerate(bars):
        ema = b.c if i == 0 else b.c * k + ema * (1 - k)
        out.append(ema)
    return out


def _atrs(bars: Sequence[Bar], length: int) -> list[float]:
    """Rolling-mean ATR. Early bars use the partial window so the series
    is fully defined; deterministic either way.
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


def _detect_one(
    bars: Sequence[Bar],
    i: int,
    direction: str,
    emas: list[float],
    atrs: list[float],
    cfg: PullbackConfig,
    timeframe: str,
) -> PullbackSignal | None:
    """Check whether bar `i` is a with-trend prior-bar breakout-stop fire
    out of a small pullback. Uses only bars[:i + 1]. Returns the signal
    or None.
    """
    long = direction == "long"
    prev = bars[i - 1]
    cur = bars[i]

    # 1. Entry trigger: price trades one tick past the prior bar's
    #    extreme — this is where the resting Brooks stop order fills.
    if long:
        if cur.h <= prev.h:
            return None
    else:
        if cur.l >= prev.l:
            return None

    # 2. The pullback: walk back from the prior bar over the run of bars
    #    that FAILED to extend the trend (no higher high / no lower low).
    pb_start = i - 1
    while pb_start > 0:
        b, b_prev = bars[pb_start], bars[pb_start - 1]
        is_pullback_bar = b.h <= b_prev.h if long else b.l >= b_prev.l
        if not is_pullback_bar:
            break
        pb_start -= 1
    pb_start += 1
    pullback_len = i - pb_start
    if not (cfg.pullback_min_bars <= pullback_len <= cfg.pullback_max_bars):
        return None

    # 3. The impulse: the run of trend-extending bars before the pullback.
    imp_top = pb_start - 1
    if imp_top < 1:
        return None
    imp_start = imp_top
    while imp_start > 0:
        b, b_prev = bars[imp_start], bars[imp_start - 1]
        extends = b.h > b_prev.h if long else b.l < b_prev.l
        if not extends:
            break
        imp_start -= 1
    impulse_bars = imp_top - imp_start + 1
    if impulse_bars < cfg.impulse_min_bars:
        return None

    atr = atrs[i]
    if atr <= 0:
        return None

    if long:
        impulse_height = bars[imp_top].h - bars[imp_start].l
    else:
        impulse_height = bars[imp_start].h - bars[imp_top].l
    impulse_atr = impulse_height / atr
    if impulse_atr < cfg.impulse_min_atr:
        return None

    # 4. "Small": the pullback is shallow and never erases the impulse.
    if long:
        pullback_extreme = min(bars[j].l for j in range(pb_start, i))
        depth = bars[imp_top].h - pullback_extreme
        if pullback_extreme <= bars[imp_start].l:
            return None
    else:
        pullback_extreme = max(bars[j].h for j in range(pb_start, i))
        depth = pullback_extreme - bars[imp_top].l
        if pullback_extreme >= bars[imp_start].h:
            return None
    retrace = depth / impulse_height
    if retrace > cfg.pullback_max_retrace:
        return None

    # 5. Trend filter: EMA sloping with the trend, impulse on the trend
    #    side of the EMA, and the pullback holds the EMA (a small poke
    #    past it is allowed — Brooks pullbacks often test the average).
    ema_fire = emas[i]
    tol = cfg.ema_tolerance_atr * atr
    if long:
        if ema_fire <= emas[imp_start]:
            return None
        if bars[imp_top].c <= emas[imp_top]:
            return None
        if pullback_extreme < ema_fire - tol:
            return None
    else:
        if ema_fire >= emas[imp_start]:
            return None
        if bars[imp_top].c >= emas[imp_top]:
            return None
        if pullback_extreme > ema_fire + tol:
            return None

    score = round(
        impulse_atr
        + (1.0 - retrace) * 2.0
        + (cfg.pullback_max_bars - pullback_len + 1) * 0.5,
        3,
    )

    return PullbackSignal(
        direction=direction,
        timeframe=timeframe,
        fire_ts=cur.t,
        fire_index=i,
        entry_price=prev.h if long else prev.l,
        stop_price=pullback_extreme,
        impulse_atr=round(impulse_atr, 3),
        pullback_len=pullback_len,
        retrace=round(retrace, 3),
        score=score,
        impulse_start_ts=bars[imp_start].t,
        impulse_top_ts=bars[imp_top].t,
        pullback_bar_timestamps=tuple(bars[j].t for j in range(pb_start, i)),
    )


def detect_pullbacks(
    bars: Sequence[Bar],
    config: PullbackConfig | None = None,
    timeframe: str = "",
) -> list[PullbackSignal]:
    """Return every small-pullback breakout-stop signal in `bars`.

    Pure sliding-window function over an arbitrary bar list — works on
    any timeframe. One signal per qualifying fire bar; once a trend
    resumes, the next bar has no preceding pullback so it does not
    re-fire. Long and short are both checked at every bar.
    """
    cfg = config or PullbackConfig()
    warmup = cfg.ema_len
    if len(bars) <= warmup + cfg.impulse_min_bars:
        return []

    emas = _emas(bars, cfg.ema_len)
    atrs = _atrs(bars, cfg.atr_len)

    signals: list[PullbackSignal] = []
    for i in range(warmup, len(bars)):
        for direction in ("long", "short"):
            sig = _detect_one(bars, i, direction, emas, atrs, cfg, timeframe)
            if sig is not None:
                signals.append(sig)
    return signals
