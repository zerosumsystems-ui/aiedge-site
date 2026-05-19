"""Wedge detector — faithful to Al Brooks' three-push wedge.

Source: Al Brooks, *Trading Price Action: Reversals* (Wiley, 2012),
the wedge chapters. The generic chart-book "wedge" is any pair of
converging trendlines. Brooks' wedge — the one the rest of this
codebase's detectors are built on — is a far more specific thing, and
it is a REVERSAL pattern, not a breakout pattern:

  A wedge is a three-push pattern. Price makes three pushes in the
  same direction, each push reaching a new extreme, and the moves
  lose momentum — the third push is weaker than the second. The
  trend line and the trend channel line converge. After the third
  push, price reverses, and that reversal is the trade.

So a Brooks wedge has two halves:

  1. THREE PUSHES — three swing highs H1 < H2 < H3 (a "wedge top",
     bearish) or three swing lows L1 > L2 > L3 (a "wedge bottom",
     bullish), each separated by a pullback, with the final push
     decelerating (push 3 smaller than push 2 — momentum waning).

  2. THE REVERSAL — after the third push, the first reversal bar
     against it. A wedge top reverses DOWN (trade short); a wedge
     bottom reverses UP (trade long). Brooks enters on the reversal,
     with the protective stop beyond the third push's extreme.

The same three-pushes-then-reverse shape is both Brooks' wedge
*reversal* and his wedge *bull/bear flag* (a pullback that ends a
correction); the mechanical signal and entry are identical, so this
detector does not distinguish them.

Why this detector is unbiased — the property Will asked for:

  1. No hindsight on the pushes. Each swing pivot needs PIVOT_K bars
     of confirmation on each side, so the third push is only
     *confirmed* PIVOT_K bars after it prints. The signal is emitted
     at `max(reversal bar, H3 + PIVOT_K)` — the first bar at which a
     live observer could know both that the third push was a pivot
     and that price reversed.

  2. No hindsight on the reversal. The reversal test is a CLOSED
     bar's close. Entry is simulated at the NEXT bar's open.

  3. Backfill == live. Every check for the signal emitted at bar n
     reads only bars[:n + 1], so a historical sweep emits exactly the
     set of signals a streaming bar-by-bar scanner would have emitted
     in real time. Verified by a backfill-equals-live-replay test.

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
WEDGE_LOOKBACK = 80      # the three pushes must fall inside the most
                         # recent 80 bars.
MIN_WEDGE_SPAN = 12      # the first and third push must span >= 12
                         # bars — three adjacent wiggles are not a
                         # wedge.
DECELERATION_MAX = 0.85  # Brooks: the third push loses momentum. Its
                         # height must be <= 85% of the second push's.
MAX_REVERSAL_GAP = 8     # the reversal must come within 8 bars of the
                         # third push, or it is unrelated to the wedge.
COOLDOWN_BARS = 10       # one wedge structure emits one signal.


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
    score: float              # stable rank key for the scanner UI


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


# ----- wedge geometry -------------------------------------------------

def _evaluate_top(
    bars: Sequence[Bar], highs: list[int], lows: list[int],
) -> tuple[float, float, tuple[int, int, int]] | None:
    """Try to read a three-push wedge TOP from the confirmed pivots.

    Uses the three most recent confirmed pivot highs as the pushes.
    Returns (push_extreme, deceleration, push_ts) or None.
    """
    if len(highs) < 3:
        return None
    h1, h2, h3 = highs[-3], highs[-2], highs[-1]
    p1, p2, p3 = bars[h1].h, bars[h2].h, bars[h3].h
    if not (p1 < p2 < p3):
        return None  # three pushes must each reach a NEW high
    if h3 - h1 < MIN_WEDGE_SPAN:
        return None

    # A pullback low must separate each pair of pushes.
    low_12 = [lo for lo in lows if h1 < lo < h2]
    low_23 = [lo for lo in lows if h2 < lo < h3]
    if not low_12 or not low_23:
        return None
    l1 = max(bars[lo].l for lo in low_12)  # shallowest pullback
    l2 = max(bars[lo].l for lo in low_23)

    # Brooks: the third push loses momentum.
    push2 = p2 - l1
    push3 = p3 - l2
    if push2 <= 0 or push3 <= 0:
        return None
    decel = push3 / push2
    if decel > DECELERATION_MAX:
        return None

    return p3, decel, (bars[h1].t, bars[h2].t, bars[h3].t)


def _evaluate_bottom(
    bars: Sequence[Bar], highs: list[int], lows: list[int],
) -> tuple[float, float, tuple[int, int, int]] | None:
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

    return p3, decel, (bars[l1].t, bars[l2].t, bars[l3].t)


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

        # Confirmed pivots at evaluation bar n: index <= n - k.
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
                pushes = highs
                reversal = _is_bear_reversal
                direction = "short"
            else:
                wedge = _evaluate_bottom(bars, highs, lows)
                pushes = lows
                reversal = _is_bull_reversal
                direction = "long"
            if wedge is None:
                continue
            push_extreme, decel, push_ts = wedge

            third = pushes[-1]  # index of the third push pivot
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

            # The signal is knowable only once BOTH the third push is
            # confirmed (third + k) and the reversal has printed (rev).
            emission = max(rev, third + k)
            if emission != n:
                continue  # emit once, at the exact knowable bar

            # Stable score: a wedge whose third push died hardest
            # (lowest deceleration ratio) ranks highest.
            score = 3.0 + (1.0 - decel) * 4.0

            signals.append(WedgeSignal(
                direction=direction,
                wedge_type=wedge_type,
                fire_ts=bars[n].t,
                fired_bar_index=n,
                push_ts=push_ts,
                push_extreme=push_extreme,
                deceleration=decel,
                score=score,
            ))
            cooldown_until = n + COOLDOWN_BARS
            break  # at most one wedge per emission bar

    return signals
