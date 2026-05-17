"""Trend-from-open context features — the day/trend signature Brooks
describes in 'Trend from the Open and Small Pullback Trends'.

The locked 14-feature set in tfo_features.py describes the FIRE BAR and
its confirming run. This module is the complement: it describes the
DAY around a decision bar — the opening gap, the first bar, the spike,
the size of the pullbacks so far, the distance from the moving average,
the trend structure. These are the hard-codeable features behind the
strong trend-from-open / small-pullback day; they are intended as
additional inputs to the scanner ML model, not as a standalone rule.

EVERY feature is computed from bars[: at_index + 1] only — nothing
after the decision bar is read. This is the same hindsight-free
contract that tfo_detector.py and tfo_features.py advertise, and the
test module verifies it (a bars-so-far slice gives byte-identical
output to the full session). The training LABEL — did the day go on to
trend — is hindsight by nature and is computed elsewhere, never here.

Each feature is grounded in a verbatim Brooks passage:

  gap_pct / gap_abs_adr      "These days often open with large gaps."
  first_bar_*                "the first bar is a strong trend bar
                              (small tail, good-sized bar)."
  opening_range_adr          "the opening range was about half [or
                              under a third] of an average daily range."
  spike_present / consec     "If the market trends for four or more bars
                              without a pullback, or even two large
                              trend bars... a strong spike."
  largest_pullback_adr       small-pullback day = "all of the pullbacks
                              are less than 20 to 30 percent of the
                              recent average daily range."
  pullback_ratio             the later pullback "about twice the size of
                              the biggest pullback since the trend began."
  dist_from_ema_adr /        "the market never seems to get back to the
  bars_since_ema_touch        moving average."
  paused_by_bar_4            "If the market does not pause by the third
                              or fourth bar, it might have gone too far
                              too fast."
  counter_trend_bar_frac     strong trends have "many countertrend trend
                              bars" yet small pullbacks.

Pure functions only — no Databento, no Supabase, no HTTP. Operates on
the Bar5m shape from tfo_detector.
"""

from __future__ import annotations

from typing import Sequence

from tfo_detector import Bar5m

# Locked order — append new keys, never reorder or remove (a reorder
# silently corrupts any model trained on the prior order).
FEATURE_KEYS: tuple[str, ...] = (
    # opening gap
    "gap_pct",
    "gap_abs_adr",
    # first bar
    "first_bar_body_ratio",
    "first_bar_close_pos",
    "first_bar_tail_frac",
    "first_bar_range_adr",
    # opening character
    "opening_range_adr",
    "bars_since_open",
    "paused_by_bar_4",
    # trend so far
    "trend_dir",
    "extreme_bar_index",
    "extreme_in_first_two",
    "net_from_open_adr",
    "max_consecutive_trend_bars",
    "spike_present",
    "close_position_session",
    # pullbacks — the small-pullback-day signature
    "largest_pullback_adr",
    "recent_pullback_adr",
    "pullback_ratio",
    "counter_trend_bar_frac",
    # moving average (within-session 20-bar EMA)
    "dist_from_ema_adr",
    "bars_since_ema_touch",
)

EMA_PERIOD = 20
RECENT_WINDOW = 6        # "recent" pullback lookback, in 5-min bars
SPIKE_RUN = 4            # Brooks: 4+ bars without a pullback = a spike
STRONG_BODY = 0.50       # strong trend bar: body >= 50% of range
LARGE_BAR_MULT = 1.5     # "large trend bar" = range >= 1.5x the avg bar


def _rng(b: Bar5m) -> float:
    return b.h - b.l


def _body_ratio(b: Bar5m) -> float:
    r = _rng(b)
    return abs(b.c - b.o) / r if r > 0 else 0.0


def _close_pos(b: Bar5m) -> float:
    r = _rng(b)
    return (b.c - b.l) / r if r > 0 else 0.5


def _ema_series(bars: Sequence[Bar5m]) -> list[float]:
    """Within-session 20-bar EMA of the close, seeded at the first bar.

    Note: this is a WITHIN-SESSION EMA — it resets each day. Brooks'
    charts use a continuous EMA that carries across the prior session;
    a future refinement is to seed from stitched prior-day bars. As a
    'how far is price extended from its own intraday mean' feature the
    within-session EMA is still meaningful and keeps the module
    self-contained and deterministic.
    """
    alpha = 2.0 / (EMA_PERIOD + 1)
    out: list[float] = []
    ema = bars[0].c
    for b in bars:
        ema = alpha * b.c + (1 - alpha) * ema
        out.append(ema)
    return out


def _largest_pullback(bars: Sequence[Bar5m], direction: int) -> float:
    """Deepest counter-trend retrace from an ALREADY-ESTABLISHED extreme,
    in price. The first bar only seeds the running extreme — its own
    range is not itself a pullback."""
    worst = 0.0
    if direction > 0:        # bull — dip below the running high
        peak = bars[0].h
        for b in bars[1:]:
            worst = max(worst, peak - b.l)
            peak = max(peak, b.h)
    elif direction < 0:      # bear — pop above the running low
        trough = bars[0].l
        for b in bars[1:]:
            worst = max(worst, b.h - trough)
            trough = min(trough, b.l)
    return worst


def extract_tfo_context(
    bars: Sequence[Bar5m],
    *,
    at_index: int,
    prior_close: float | None = None,
    adr: float | None = None,
) -> dict | None:
    """Feature vector describing the trend-from-open context at a bar.

    bars         — session 5-min RTH bars, chronological, bar 0 = the
                   09:30 ET open bar.
    at_index     — the DECISION bar. Every feature uses bars[:at_index+1]
                   only; nothing after it is read.
    prior_close  — the prior session's close, for the opening gap. None
                   leaves the gap features at 0.
    adr          — the symbol's average daily range, for normalising
                   sizes. None leaves *_adr features at 0.

    Returns a dict keyed by FEATURE_KEYS (numeric, model-ready), or None
    if at_index is out of range / there are too few bars.
    """
    n = len(bars)
    if n == 0 or at_index < 1 or at_index >= n:
        return None

    win = list(bars[: at_index + 1])      # bars so far, inclusive
    first = win[0]
    cur = win[at_index]
    a = adr if (adr and adr > 0) else None

    # ----- opening gap ------------------------------------------------
    if prior_close and prior_close > 0:
        gap = first.o - prior_close
        gap_pct = gap / prior_close * 100.0
        gap_abs_adr = abs(gap) / a if a else 0.0
    else:
        gap_pct = 0.0
        gap_abs_adr = 0.0

    # ----- first bar --------------------------------------------------
    fr = _rng(first)
    upper_tail = (first.h - max(first.o, first.c))
    lower_tail = (min(first.o, first.c) - first.l)
    first_bar_tail_frac = (upper_tail + lower_tail) / fr if fr > 0 else 1.0
    first_bar_range_adr = fr / a if a else 0.0

    # ----- opening range (first up-to-4 bars) ------------------------
    opening = win[: min(4, len(win))]
    opening_range = max(b.h for b in opening) - min(b.l for b in opening)
    opening_range_adr = opening_range / a if a else 0.0

    # ----- trend direction so far ------------------------------------
    lows = [b.l for b in win]
    highs = [b.h for b in win]
    lod_i = min(range(len(win)), key=lambda i: lows[i])
    hod_i = max(range(len(win)), key=lambda i: highs[i])
    if lod_i < hod_i:
        direction = 1            # low came first -> upward bias
        extreme_bar = lod_i
    elif hod_i < lod_i:
        direction = -1           # high came first -> downward bias
        extreme_bar = hod_i
    else:
        direction = 0
        extreme_bar = lod_i

    # ----- net move, consecutive trend bars, spike -------------------
    net_from_open = cur.c - first.o
    net_from_open_adr = (net_from_open / a) if a else 0.0

    max_consec = consec = 0
    for b in win:
        in_dir = (b.c > b.o) if direction > 0 else (b.c < b.o) if direction < 0 else False
        consec = consec + 1 if in_dir else 0
        max_consec = max(max_consec, consec)

    avg_bar_range = sum(_rng(b) for b in win) / len(win)
    two_large = False
    for i in range(1, len(win)):
        a_in = ((win[i - 1].c > win[i - 1].o) if direction > 0
                else (win[i - 1].c < win[i - 1].o) if direction < 0 else False)
        b_in = ((win[i].c > win[i].o) if direction > 0
                else (win[i].c < win[i].o) if direction < 0 else False)
        if (a_in and b_in
                and _rng(win[i - 1]) >= LARGE_BAR_MULT * avg_bar_range
                and _rng(win[i]) >= LARGE_BAR_MULT * avg_bar_range):
            two_large = True
            break
    spike_present = 1.0 if (max_consec >= SPIKE_RUN or two_large) else 0.0

    sess_lo, sess_hi = min(lows), max(highs)
    sess_rng = sess_hi - sess_lo
    if sess_rng > 0:
        close_position_session = ((cur.c - sess_lo) / sess_rng if direction >= 0
                                  else (sess_hi - cur.c) / sess_rng)
    else:
        close_position_session = 0.5

    # ----- pullbacks --------------------------------------------------
    largest_pb = _largest_pullback(win, direction)
    recent_pb = _largest_pullback(win[-RECENT_WINDOW:], direction)
    largest_pullback_adr = (largest_pb / a) if a else 0.0
    recent_pullback_adr = (recent_pb / a) if a else 0.0
    pullback_ratio = (recent_pb / largest_pb) if largest_pb > 0 else 0.0

    counter = 0
    for b in win[1:]:
        if direction > 0 and b.c < b.o:
            counter += 1
        elif direction < 0 and b.c > b.o:
            counter += 1
    counter_trend_bar_frac = counter / (len(win) - 1) if len(win) > 1 else 0.0

    # ----- "paused by bar 3-4?" --------------------------------------
    # a pause = a bar in indices 1..3 that does NOT extend the drive
    # (a counter-direction close, or a weak-bodied bar).
    paused = 0.0
    for b in win[1:4]:
        in_dir = (b.c > b.o) if direction > 0 else (b.c < b.o) if direction < 0 else True
        if (not in_dir) or _body_ratio(b) < STRONG_BODY:
            paused = 1.0
            break

    # ----- moving average --------------------------------------------
    ema = _ema_series(win)
    ema_now = ema[at_index]
    if a:
        signed = (cur.c - ema_now) if direction >= 0 else (ema_now - cur.c)
        dist_from_ema_adr = signed / a
    else:
        dist_from_ema_adr = 0.0
    bars_since_ema_touch = at_index
    for k in range(at_index, -1, -1):
        if win[k].l <= ema[k] <= win[k].h:
            bars_since_ema_touch = at_index - k
            break

    return {
        "gap_pct": round(gap_pct, 4),
        "gap_abs_adr": round(gap_abs_adr, 4),
        "first_bar_body_ratio": round(_body_ratio(first), 4),
        "first_bar_close_pos": round(_close_pos(first), 4),
        "first_bar_tail_frac": round(first_bar_tail_frac, 4),
        "first_bar_range_adr": round(first_bar_range_adr, 4),
        "opening_range_adr": round(opening_range_adr, 4),
        "bars_since_open": int(at_index),
        "paused_by_bar_4": paused,
        "trend_dir": int(direction),
        "extreme_bar_index": int(extreme_bar),
        "extreme_in_first_two": 1.0 if extreme_bar < 2 else 0.0,
        "net_from_open_adr": round(net_from_open_adr, 4),
        "max_consecutive_trend_bars": int(max_consec),
        "spike_present": spike_present,
        "close_position_session": round(close_position_session, 4),
        "largest_pullback_adr": round(largest_pullback_adr, 4),
        "recent_pullback_adr": round(recent_pullback_adr, 4),
        "pullback_ratio": round(pullback_ratio, 4),
        "counter_trend_bar_frac": round(counter_trend_bar_frac, 4),
        "dist_from_ema_adr": round(dist_from_ema_adr, 4),
        "bars_since_ema_touch": int(bars_since_ema_touch),
    }
