"""Wedge detector — faithful to Al Brooks' three-push wedge.

Source: Al Brooks, *Trading Price Action: Reversals* and the bar-by-bar
wedge narration in *Reading Price Charts Bar by Bar* (the verbatim text
committed under public/brooks-tour/). The generic chart-book "wedge"
is any pair of converging trendlines. Brooks' wedge — the one the rest
of this codebase's detectors are built on — is a three-push pattern,
and it is a REVERSAL, not a breakout:

  Price makes three pushes in the same direction, each reaching a new
  extreme; the moves lose momentum (the third push is weaker than the
  second); then price reverses, and the reversal is the trade.

So a Brooks wedge has two halves:

  1. THREE PUSHES — three swing highs H1 < H2 < H3 (a "wedge top",
     bearish) or three swing lows L1 > L2 > L3 (a "wedge bottom",
     bullish), each separated by a pullback, the final push
     decelerating (push 3 height <= 85% of push 2).

  2. THE REVERSAL — the first reversal bar against the third push.

GOOD vs BAD wedges — Brooks' own distinctions, encoded as the four
quality fields on WedgeSignal (the detector emits *every* wedge; the
fields, not a filter, separate good from bad — see the backtest):

  * `is_flag` — Brooks splits the wedge in two. A wedge whose three
    pushes run *against* the larger trend is a wedge *flag* (a
    pullback); trading its reversal is *with* the larger trend —
    higher probability. A wedge whose pushes run *with* the trend is a
    countertrend *reversal* — lower probability. is_flag marks the
    flag case.
  * `channel_overshoot` — "a bear micro wedge that overshot the trend
    channel line that could be drawn across the bottoms of the prior
    three bars." A real wedge's third push poking *past* the line
    through the first two pushes, then failing, is the signal. >0 =
    overshoot.
  * `reversal_strength` — Brooks: "the market rarely reverses very far
    on the first attempt, especially when the signal bar has a close
    in the middle instead of at its low." A strong reversal bar (big
    body, close at its extreme) scores high.
  * `deepening_pullbacks` — "As a trend wears on, the bulls typically
    will want deeper pullbacks." A second pullback deeper than the
    first is the trend losing strength — a precondition for a real
    reversal.

  Brooks also warns the bad cases: "micro wedges by themselves don't
  usually lead to major reversals" (no confluence) and a wedge that
  reverses into "a relatively tight bear channel" should be skipped.
  `score` rewards the good signs so the scanner and backtest can sort
  and segment by wedge quality.

Why this detector is unbiased — the property Will asked for:

  1. No hindsight on the pushes. Each swing pivot needs PIVOT_K bars
     of confirmation on each side, so the third push is only
     *confirmed* PIVOT_K bars after it prints. The signal is emitted
     at `max(reversal bar, H3 + PIVOT_K)` — the first bar at which a
     live observer could know both facts.

  2. No hindsight on the reversal. The reversal test is a CLOSED
     bar's close. Entry is simulated at the NEXT bar's open.

  3. Backfill == live. Every check for the signal emitted at bar n
     reads only bars[:n + 1], so a historical sweep emits exactly the
     set of signals a streaming scanner would have emitted in real
     time. Verified by a backfill-equals-live-replay test. Every
     quality field is likewise computed only from bars[:n + 1].

  4. No selection of winners. Every three-push-then-reverse wedge is
     emitted, including the ones whose reversal immediately fails.

Pure functions only — no Databento, no Supabase, no HTTP. Timeframe-
agnostic; callers fetch + persist + backtest.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


# ----- pre-registered thresholds (fixed before any results seen) ------

PIVOT_K = 3              # a swing pivot needs 3 bars of lower-high /
                         # higher-low context on each side; it is
                         # confirmed PIVOT_K bars later.
WEDGE_LOOKBACK = 80      # the three pushes must fall inside the last
                         # 80 bars.
MIN_WEDGE_SPAN = 12      # push 1 -> push 3 must span >= 12 bars.
DECELERATION_MAX = 0.85  # Brooks: the third push loses momentum. Its
                         # height must be <= 85% of the second push's.
MAX_REVERSAL_GAP = 8     # the reversal must come within 8 bars of the
                         # third push.
COOLDOWN_BARS = 10       # one wedge structure emits one signal.
TREND_LOOKBACK = 15      # bars before push 1 used to read the larger
                         # trend the wedge sits in (flag vs reversal).


@dataclass(frozen=True)
class Bar:
    """Minimal OHLCV bar. `t` is the bar-open epoch (seconds, UTC).
    Callers must hand bars in chronological order with no gaps."""
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0


@dataclass(frozen=True)
class WedgeSignal:
    direction: str            # 'long' (wedge bottom) / 'short' (wedge top)
    wedge_type: str           # 'top' or 'bottom'
    fire_ts: int              # epoch seconds of the emission bar
    fired_bar_index: int      # bar index of the emission bar
    push_ts: tuple[int, int, int]  # epochs of the 3 push extremes
    push_extreme: float       # price of the 3rd push — the stop reference
    deceleration: float       # push3 / push2 (< 1 — smaller = weaker)
    # ----- Brooks good/bad-wedge quality fields -----
    is_flag: bool             # pushes run against the larger trend ->
                              # the reversal is a with-trend flag trade
    channel_overshoot: float  # push 3 vs the push1-push2 trend channel
                              # line, normalised by push 2 (>0 = overshoot)
    reversal_strength: float  # 0..1 — body × close-at-extreme of the
                              # reversal (signal) bar
    deepening_pullbacks: bool # 2nd pullback deeper than the 1st
    score: float              # stable rank key — higher = better wedge


# ----- pivots ---------------------------------------------------------

def _confirmed_pivot_highs(bars: Sequence[Bar], upto: int, k: int) -> list[int]:
    """Indices of swing highs confirmed using only bars[:upto + 1].

    A swing high at i is strictly higher than every bar within k on
    each side, and is confirmed only once the k right-context bars
    exist (i + k <= upto)."""
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


# ----- reversal bars --------------------------------------------------

def _is_bear_reversal(bars: Sequence[Bar], i: int) -> bool:
    """A bear reversal bar: a down bar that closes below the prior
    bar's low — Brooks' sell signal bar after a third push up."""
    if i < 1:
        return False
    b = bars[i]
    return b.c < b.o and b.c < bars[i - 1].l


def _is_bull_reversal(bars: Sequence[Bar], i: int) -> bool:
    """Mirror: an up bar that closes above the prior bar's high."""
    if i < 1:
        return False
    b = bars[i]
    return b.c > b.o and b.c > bars[i - 1].h


def _reversal_strength(bar: Bar, direction: str) -> float:
    """0..1 strength of a reversal (signal) bar — Brooks rewards a big
    body that closes at its extreme, penalises a close in the middle."""
    rng = bar.h - bar.l
    if rng <= 0:
        return 0.0
    if direction == "short":            # bear signal bar
        body = max(0.0, bar.o - bar.c)
        close_at_extreme = 1.0 - (bar.c - bar.l) / rng   # close near low
    else:                               # bull signal bar
        body = max(0.0, bar.c - bar.o)
        close_at_extreme = (bar.c - bar.l) / rng         # close near high
    return (body / rng) * close_at_extreme


# ----- wedge geometry -------------------------------------------------

@dataclass(frozen=True)
class _Wedge:
    """Intermediate three-push reading, before the reversal is found."""
    push_idx: tuple[int, int, int]
    push_prices: tuple[float, float, float]
    pullback_prices: tuple[float, float]   # (between p1&p2, between p2&p3)
    push_extreme: float
    deceleration: float


def _evaluate_top(
    bars: Sequence[Bar], highs: list[int], lows: list[int],
) -> _Wedge | None:
    """Read a three-push wedge TOP from the most recent confirmed
    pivot highs. Returns a `_Wedge` or None."""
    if len(highs) < 3:
        return None
    h1, h2, h3 = highs[-3], highs[-2], highs[-1]
    p1, p2, p3 = bars[h1].h, bars[h2].h, bars[h3].h
    if not (p1 < p2 < p3):
        return None  # three pushes must each reach a NEW high
    if h3 - h1 < MIN_WEDGE_SPAN:
        return None

    low_12 = [lo for lo in lows if h1 < lo < h2]
    low_23 = [lo for lo in lows if h2 < lo < h3]
    if not low_12 or not low_23:
        return None
    l1 = max(bars[lo].l for lo in low_12)  # shallowest pullback
    l2 = max(bars[lo].l for lo in low_23)

    push2 = p2 - l1
    push3 = p3 - l2
    if push2 <= 0 or push3 <= 0:
        return None
    decel = push3 / push2
    if decel > DECELERATION_MAX:
        return None  # Brooks: the third push must lose momentum

    return _Wedge((h1, h2, h3), (p1, p2, p3), (l1, l2), p3, decel)


def _evaluate_bottom(
    bars: Sequence[Bar], highs: list[int], lows: list[int],
) -> _Wedge | None:
    """Mirror of `_evaluate_top` for a three-push wedge BOTTOM."""
    if len(lows) < 3:
        return None
    l1, l2, l3 = lows[-3], lows[-2], lows[-1]
    p1, p2, p3 = bars[l1].l, bars[l2].l, bars[l3].l
    if not (p1 > p2 > p3):
        return None  # three pushes must each reach a NEW low
    if l3 - l1 < MIN_WEDGE_SPAN:
        return None

    high_12 = [hi for hi in highs if l1 < hi < l2]
    high_23 = [hi for hi in highs if l2 < hi < l3]
    if not high_12 or not high_23:
        return None
    h1 = min(bars[hi].h for hi in high_12)  # shallowest pullback
    h2 = min(bars[hi].h for hi in high_23)

    push2 = h1 - p2
    push3 = h2 - p3
    if push2 <= 0 or push3 <= 0:
        return None
    decel = push3 / push2
    if decel > DECELERATION_MAX:
        return None

    return _Wedge((l1, l2, l3), (p1, p2, p3), (h1, h2), p3, decel)


def _channel_overshoot(wedge: _Wedge, wedge_type: str) -> float:
    """How far the third push pokes past the trend channel line drawn
    through pushes 1 and 2, normalised by the second push's height.

    Brooks: a real wedge overshoots that line on the third push. >0 is
    an overshoot, <0 an undershoot (an even more exhausted third push).
    """
    (i1, i2, i3) = wedge.push_idx
    (p1, p2, p3) = wedge.push_prices
    if i2 == i1:
        return 0.0
    slope = (p2 - p1) / (i2 - i1)
    line_at_i3 = p1 + slope * (i3 - i1)
    push2 = abs(p2 - wedge.pullback_prices[0])
    if push2 <= 0:
        return 0.0
    # A top overshoots upward (p3 above the line); a bottom downward.
    raw = (p3 - line_at_i3) if wedge_type == "top" else (line_at_i3 - p3)
    return raw / push2


def _deepening_pullbacks(wedge: _Wedge, wedge_type: str) -> bool:
    """True when the second counter-move is deeper than the first —
    the trend losing strength, a Brooks precondition for a reversal."""
    (p1, p2, _) = wedge.push_prices
    (q1, q2) = wedge.pullback_prices
    if wedge_type == "top":
        return (p2 - q2) > (p1 - q1)   # pullback depth from each push high
    return (q2 - p2) > (q1 - p1)       # rally height from each push low


def _is_flag(
    bars: Sequence[Bar], wedge: _Wedge, wedge_type: str,
) -> bool:
    """True when the wedge's three pushes run *against* the larger
    trend — a Brooks wedge flag, whose reversal is a with-trend trade.

    The larger trend is read from the close TREND_LOOKBACK bars before
    the first push. A wedge top (pushes up) inside a prior downtrend is
    a bear flag; a wedge bottom (pushes down) inside a prior uptrend is
    a bull flag.
    """
    i1 = wedge.push_idx[0]
    w = i1 - TREND_LOOKBACK
    if w < 0:
        return False  # not enough context — treat as a plain reversal
    prior = bars[w].c
    p1 = wedge.push_prices[0]
    if wedge_type == "top":
        return prior > p1   # price fell into the wedge -> bear flag
    return prior < p1       # price rose into the wedge -> bull flag


def detect_wedges(bars: Sequence[Bar], *, k: int = PIVOT_K) -> list[WedgeSignal]:
    """Return every three-push wedge-reversal signal in `bars`.

    Live-replay semantics: the signal emitted at bar n is derived
    purely from bars[:n + 1]. Scanning a full history yields exactly
    the signals a streaming scanner would have emitted bar by bar.
    """
    signals: list[WedgeSignal] = []
    n_bars = len(bars)
    if n_bars < MIN_WEDGE_SPAN + 3 * k:
        return signals

    cooldown_until = -1
    for n in range(MIN_WEDGE_SPAN + 3 * k, n_bars):
        if n <= cooldown_until:
            continue

        window_start = max(0, n - WEDGE_LOOKBACK)
        highs = [
            i for i in _confirmed_pivot_highs(bars, n, k)
            if i >= window_start and i <= n - k
        ]
        lows = [
            i for i in _confirmed_pivot_lows(bars, n, k)
            if i >= window_start and i <= n - k
        ]

        for wedge_type in ("top", "bottom"):
            if wedge_type == "top":
                wedge = _evaluate_top(bars, highs, lows)
                reversal = _is_bear_reversal
                direction = "short"
            else:
                wedge = _evaluate_bottom(bars, highs, lows)
                reversal = _is_bull_reversal
                direction = "long"
            if wedge is None:
                continue

            third = wedge.push_idx[-1]
            # First reversal bar after the third push. Capped at n so
            # the search never reads a bar the emission bar cannot see.
            rev = None
            for r in range(third + 1,
                            min(third + 1 + MAX_REVERSAL_GAP, n + 1)):
                if reversal(bars, r):
                    rev = r
                    break
            if rev is None:
                continue

            # Knowable only once the third push is confirmed
            # (third + k) AND the reversal has printed (rev).
            emission = max(rev, third + k)
            if emission != n:
                continue

            # ----- Brooks good/bad-wedge quality fields -----
            overshoot = _channel_overshoot(wedge, wedge_type)
            strength = _reversal_strength(bars[rev], direction)
            deepening = _deepening_pullbacks(wedge, wedge_type)
            flag = _is_flag(bars, wedge, wedge_type)

            # Score rewards the Brooks "good wedge" signs. Fixed
            # weights, never tuned to the equity curve.
            score = (
                3.0
                + 2.0 * strength
                + (2.0 if flag else 0.0)
                + 2.0 * max(0.0, min(overshoot, 1.0))
                + (1.0 if deepening else 0.0)
            )

            signals.append(WedgeSignal(
                direction=direction,
                wedge_type=wedge_type,
                fire_ts=bars[n].t,
                fired_bar_index=n,
                push_ts=tuple(bars[i].t for i in wedge.push_idx),
                push_extreme=wedge.push_extreme,
                deceleration=wedge.deceleration,
                is_flag=flag,
                channel_overshoot=overshoot,
                reversal_strength=strength,
                deepening_pullbacks=deepening,
                score=score,
            ))
            cooldown_until = n + COOLDOWN_BARS
            break  # at most one wedge per emission bar

    return signals
