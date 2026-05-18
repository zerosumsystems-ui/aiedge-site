"""Wedge pattern detector — converging-trendline breakouts, no hindsight.

A wedge is two converging trendlines drawn through swing pivots:

  - RISING WEDGE  — resistance and support both slope up, support
    rising faster, so the channel narrows. Conventionally bearish:
    the trade is the DOWNSIDE break (a close below support).
    Direction = "short".

  - FALLING WEDGE — resistance and support both slope down, resistance
    falling faster, so the channel narrows. Conventionally bullish:
    the trade is the UPSIDE break (a close above resistance).
    Direction = "long".

The pattern on its own is not a trade — wedges resolve with a
breakout. This module emits ONE signal per wedge, at the bar whose
CLOSE first prints outside the wedge in the conventional direction.
That breakout bar is the fire bar.

Why this detector is unbiased — the property Will asked for:

  1. No hindsight on pivots. A swing pivot at index i needs PIVOT_K
     bars of confirmation on each side, so it is only *confirmed* at
     index i + PIVOT_K. When the detector evaluates a breakout at bar
     n it uses only pivots with i <= n - PIVOT_K — pivots a live
     observer would already have seen.

  2. No hindsight on the trendlines. Each line is fit by least
     squares on confirmed pivots only, never on the future.

  3. No hindsight on the breakout. The fire test is a CLOSED bar's
     close crossing a line. Entry is simulated at the NEXT bar's open
     (see backtest_wedge.py) — the fire-bar close has already printed
     by the time the signal is known, so filling there would be a
     look-ahead.

  4. Backfill == live. Every check at bar n reads only bars[:n+1], so
     a historical full-history sweep emits exactly the set of signals
     a streaming bar-by-bar scanner would have emitted in real time.
     There is no separate "backtest detector".

  5. No survivorship / selection inside the detector. Every wedge that
     breaks out is emitted, including the ones that immediately fail.
     The caller does not get to keep only the winners.

Pure functions only — no Databento, no Supabase, no HTTP. Callers
fetch + persist + backtest. Designed for DAILY bars (wedges are swing
patterns), but the math is timeframe-agnostic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


# ----- pre-registered thresholds (fixed before any results seen) ------

PIVOT_K = 3              # a swing pivot needs 3 bars of strictly
                         # lower-high / higher-low context on each
                         # side; it is confirmed PIVOT_K bars later.
WEDGE_WINDOW = 60        # trendlines are fit on pivots inside the most
                         # recent 60 bars — a swing-scale lookback.
MIN_PIVOTS = 3           # each trendline needs >= 3 confirmed pivots.
MIN_WEDGE_SPAN = 12      # the pivots used must span >= 12 bars, so a
                         # handful of adjacent wiggles cannot form a
                         # "wedge".
CONVERGENCE_MAX = 0.80   # channel width at the right edge must be
                         # <= 80% of the width at the left edge —
                         # the lines must genuinely be closing.
MAX_BARS_SINCE_PIVOT = 15  # the most recent pivot must be no older
                         # than 15 bars at the breakout, or the wedge
                         # is stale and the break is unrelated to it.
COOLDOWN_BARS = 10       # after a wedge fires, suppress new fires for
                         # 10 bars so one structure emits one signal.
LINE_FIT_TOLERANCE = 0.50  # every pivot must sit within 50% of the
                         # mean channel width of its fitted line — a
                         # cheap collinearity guard so a scatter of
                         # pivots is not fit into a fake trendline.


@dataclass(frozen=True)
class Bar:
    """Minimal OHLCV bar.

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
class WedgeSignal:
    direction: str            # 'long' (falling wedge) or 'short' (rising)
    wedge_type: str           # 'falling' or 'rising'
    fire_ts: int              # epoch seconds of the breakout bar
    fired_bar_index: int      # bar index of the breakout bar
    upper_at_fire: float      # resistance trendline value at the fire bar
    lower_at_fire: float      # support trendline value at the fire bar
    pivot_high_ts: tuple[int, ...]  # epochs of the pivot highs used
    pivot_low_ts: tuple[int, ...]   # epochs of the pivot lows used
    convergence: float        # right-edge width / left-edge width (<1)
    score: float              # stable rank key for the scanner UI


# ----- pivots ---------------------------------------------------------

def _confirmed_pivot_highs(bars: Sequence[Bar], upto: int, k: int) -> list[int]:
    """Indices of swing highs confirmed using only bars[:upto + 1].

    A swing high at i is a bar whose high is strictly greater than the
    high of every bar within k on each side. It is "confirmed" only
    once the k right-context bars exist, i.e. i + k <= upto.
    """
    out: list[int] = []
    for i in range(k, upto - k + 1):
        h = bars[i].h
        if all(bars[j].h < h for j in range(i - k, i)) and all(
            bars[j].h < h for j in range(i + 1, i + k + 1)
        ):
            out.append(i)
    return out


def _confirmed_pivot_lows(bars: Sequence[Bar], upto: int, k: int) -> list[int]:
    """Mirror of `_confirmed_pivot_highs` for swing lows."""
    out: list[int] = []
    for i in range(k, upto - k + 1):
        lo = bars[i].l
        if all(bars[j].l > lo for j in range(i - k, i)) and all(
            bars[j].l > lo for j in range(i + 1, i + k + 1)
        ):
            out.append(i)
    return out


# ----- line fitting ---------------------------------------------------

def _fit_line(xs: Sequence[float], ys: Sequence[float]) -> tuple[float, float]:
    """Ordinary least-squares fit. Returns (slope, intercept).

    y = slope * x + intercept. Caller guarantees len >= 2 and that the
    xs are not all identical.
    """
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    slope = sxy / sxx
    intercept = my - slope * mx
    return slope, intercept


def _line_at(line: tuple[float, float], x: float) -> float:
    slope, intercept = line
    return slope * x + intercept


# ----- wedge geometry -------------------------------------------------

def _evaluate_wedge(
    bars: Sequence[Bar],
    n: int,
    k: int,
) -> tuple[str, tuple[float, float], tuple[float, float], list[int], list[int], float] | None:
    """Try to fit a converging wedge ending at bar `n`.

    Uses ONLY pivots confirmed within bars[:n + 1] (i + k <= n). Returns
    (wedge_type, upper_line, lower_line, pivot_high_idx, pivot_low_idx,
    convergence) or None if no valid wedge is present.
    """
    upto = n
    window_start = max(0, n - WEDGE_WINDOW)

    highs = [
        i for i in _confirmed_pivot_highs(bars, upto, k)
        if i >= window_start and i <= n - k
    ]
    lows = [
        i for i in _confirmed_pivot_lows(bars, upto, k)
        if i >= window_start and i <= n - k
    ]
    if len(highs) < MIN_PIVOTS or len(lows) < MIN_PIVOTS:
        return None

    # Keep the most recent MIN_PIVOTS of each — the wedge currently in
    # play, not an older structure earlier in the window.
    highs = highs[-MIN_PIVOTS:]
    lows = lows[-MIN_PIVOTS:]

    span_lo = min(highs[0], lows[0])
    span_hi = max(highs[-1], lows[-1])
    if span_hi - span_lo < MIN_WEDGE_SPAN:
        return None

    # The most recent pivot must be reasonably fresh.
    if n - max(highs[-1], lows[-1]) > MAX_BARS_SINCE_PIVOT:
        return None

    upper = _fit_line(highs, [bars[i].h for i in highs])
    lower = _fit_line(lows, [bars[i].l for i in lows])
    up_slope, _ = upper
    lo_slope, _ = lower

    # Channel width at the left and right edges of the pivot span.
    width_left = _line_at(upper, span_lo) - _line_at(lower, span_lo)
    width_right = _line_at(upper, span_hi) - _line_at(lower, span_hi)
    if width_left <= 0 or width_right <= 0:
        return None  # lines cross inside the window — not a clean wedge

    convergence = width_right / width_left
    if convergence > CONVERGENCE_MAX:
        return None  # not actually narrowing enough

    # Collinearity guard: pivots must hug their own line.
    mean_width = (width_left + width_right) / 2.0
    tol = LINE_FIT_TOLERANCE * mean_width
    if any(abs(bars[i].h - _line_at(upper, i)) > tol for i in highs):
        return None
    if any(abs(bars[i].l - _line_at(lower, i)) > tol for i in lows):
        return None

    # Classify by slope direction. Both lines must point the same way,
    # and the convergence test above already proved they narrow.
    if up_slope > 0 and lo_slope > 0 and lo_slope > up_slope:
        wedge_type = "rising"
    elif up_slope < 0 and lo_slope < 0 and up_slope < lo_slope:
        wedge_type = "falling"
    else:
        return None

    return wedge_type, upper, lower, highs, lows, convergence


def detect_wedges(bars: Sequence[Bar], *, k: int = PIVOT_K) -> list[WedgeSignal]:
    """Return every wedge-breakout signal in `bars`, oldest first.

    Live-replay semantics: the signal emitted for breakout bar n is
    derived purely from bars[:n + 1]. Scanning a full history therefore
    yields exactly the signals a streaming scanner would have emitted
    bar by bar — backfill and live cannot disagree.
    """
    signals: list[WedgeSignal] = []
    if len(bars) < WEDGE_WINDOW // 2:
        return signals

    cooldown_until = -1
    # n is the candidate breakout bar. Start once enough left-context
    # exists for MIN_PIVOTS pivots plus their confirmation.
    for n in range(MIN_WEDGE_SPAN + 2 * k, len(bars)):
        if n <= cooldown_until:
            continue

        wedge = _evaluate_wedge(bars, n, k)
        if wedge is None:
            continue
        wedge_type, upper, lower, highs, lows, convergence = wedge

        upper_n = _line_at(upper, n)
        lower_n = _line_at(lower, n)
        upper_prev = _line_at(upper, n - 1)
        lower_prev = _line_at(lower, n - 1)
        close_n = bars[n].c
        close_prev = bars[n - 1].c

        if wedge_type == "rising":
            # Bearish: fire on the first close below support, where the
            # prior bar still closed inside the wedge.
            broke = close_n < lower_n and close_prev >= lower_prev
            direction = "short"
        else:
            # Bullish: fire on the first close above resistance.
            broke = close_n > upper_n and close_prev <= upper_prev
            direction = "long"

        if not broke:
            continue

        # Stable score: tighter wedges (lower convergence) and wedges
        # with more confirming touches rank higher. Deliberately simple
        # so the scanner sort order does not move under noise.
        touches = len(highs) + len(lows)
        score = touches * 1.0 + (1.0 - convergence) * 3.0

        signals.append(WedgeSignal(
            direction=direction,
            wedge_type=wedge_type,
            fire_ts=bars[n].t,
            fired_bar_index=n,
            upper_at_fire=upper_n,
            lower_at_fire=lower_n,
            pivot_high_ts=tuple(bars[i].t for i in highs),
            pivot_low_ts=tuple(bars[i].t for i in lows),
            convergence=convergence,
            score=score,
        ))
        cooldown_until = n + COOLDOWN_BARS

    return signals
