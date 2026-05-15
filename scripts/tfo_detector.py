"""TFO (Trend From the Open) pattern detector.

A "trend from the open" prints when:

  - LOW of day forms within the first 4 RTH 5-min bars (bars 1..4),
    THEN at least 3 consecutive bull closes follow, of which at least 2
    are "strong" Brooks bull bars (body >= 50% of range, close in top
    25% of range). Direction = "long".

  - HIGH of day forms within the first 4 bars, then at least 3
    consecutive bear closes follow, of which at least 2 are strong
    Brooks bear bars. Direction = "short".

The LOD/HOD bar itself does NOT count as one of the 3 confirming bars.

Pure function on a list of 5-min bars (already filtered to RTH). No
Databento or Supabase deps — callers fetch + persist. Designed to be
called from both backfill (historical sweep) and live (each closed bar
in the Fly aggregator).

Scoring is small and deliberately stable for V1:
    score = consecutive_count * 1.0 + strong_count * 0.5

so an iron 4-of-4 strong-bar trend scores higher than the minimum
3-with-2-strong, and downstream UI can sort by score.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class Bar5m:
    """Minimal 5-minute OHLCV bar.

    `t` is the bar-open epoch (seconds, UTC). Callers must hand bars in
    chronological order, RTH-filtered, no gaps from the 9:30 ET open.
    """
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0


@dataclass(frozen=True)
class TfoSignal:
    direction: str          # 'long' or 'short'
    fire_ts: int            # epoch seconds of the 3rd confirming bar
    pivot_index: int        # bar index (0-based) where LOD/HOD formed
    fired_bar_index: int    # bar index of the 3rd confirming bar
    consecutive_count: int  # total run of in-direction closes after pivot
    strong_count: int       # how many of those are Brooks-strong bars
    score: float
    # Epoch seconds of the LOD (long) / HOD (short) pivot bar. Stored
    # alongside fire_ts so the chart can paint the pivot bar cyan
    # without re-mapping pivot_index → bar timestamp at the client.
    pivot_ts: int = 0
    # Epoch seconds of every Brooks-strong bar inside the confirming
    # run. Stored on the candidate row (strong_bar_ts column) so the
    # chart paints the exact same bars the detector counted — no
    # re-derivation of the Brooks rule in JS. Tuple keeps the dataclass
    # frozen.
    strong_bar_timestamps: tuple[int, ...] = ()


LOD_SEARCH_WINDOW = 4        # bars 1..4 (indices 0..3)
MIN_CONSECUTIVE = 3
MIN_STRONG = 2
STRONG_BODY_RATIO = 0.5      # body >= 50% of range
STRONG_CLOSE_POSITION = 0.75 # close in top 25% (long) / bottom 25% (short)


def _is_strong_bull(bar: Bar5m) -> bool:
    rng = bar.h - bar.l
    if rng <= 0:
        return False
    body = bar.c - bar.o
    if body <= 0:
        return False
    if body / rng < STRONG_BODY_RATIO:
        return False
    close_pos = (bar.c - bar.l) / rng
    return close_pos >= STRONG_CLOSE_POSITION


def _is_strong_bear(bar: Bar5m) -> bool:
    rng = bar.h - bar.l
    if rng <= 0:
        return False
    body = bar.o - bar.c
    if body <= 0:
        return False
    if body / rng < STRONG_BODY_RATIO:
        return False
    close_pos = (bar.c - bar.l) / rng
    return close_pos <= (1 - STRONG_CLOSE_POSITION)


def _confirming_run(
    bars: Sequence[Bar5m],
    start: int,
    direction: str,
    *,
    max_count: int = MIN_CONSECUTIVE,
) -> tuple[int, int, list[int]]:
    """Count consecutive in-direction closes starting at `start`, capped
    at `max_count` (default = MIN_CONSECUTIVE = 3). Stops at the first
    bar that breaks the direction, OR at `max_count`, whichever comes
    first. Returns (consecutive_count, strong_count, strong_indices).

    The cap is what eliminates the train/serve skew on consec/strong:
    backfill used to walk the FULL post-pivot run (which often extended
    past the fire bar to bars unknown at fire time); live could only
    see bars up to the fire bar. Capping at MIN_CONSECUTIVE means both
    modes see the same window — the first 3 confirming bars, which is
    exactly what the rule fires on.
    """
    consec = 0
    strong = 0
    strong_indices: list[int] = []
    for i in range(start, len(bars)):
        if consec >= max_count:
            break
        b = bars[i]
        if direction == "long":
            if b.c <= b.o:
                break
            consec += 1
            if _is_strong_bull(b):
                strong += 1
                strong_indices.append(i)
        else:
            if b.c >= b.o:
                break
            consec += 1
            if _is_strong_bear(b):
                strong += 1
                strong_indices.append(i)
    return consec, strong, strong_indices


def detect_tfo(bars: Sequence[Bar5m]) -> list[TfoSignal]:
    """Return all TFO signals found in this session's 5-min bars.

    Returns 0, 1, or 2 signals (in theory both long and short can fire
    in the same session if price reversed dramatically; in practice
    rare). Caller decides how to rank if both.

    Live-replay semantics: every check uses ONLY data that would be
    available at fire-bar close (bars[:fire_bar_idx + 1]). The detector
    therefore emits exactly the same set of signals whether called on
    a streaming bars-so-far buffer (Fly aggregator) or on a historical
    full-session bars array (backfill). No hindsight on session low,
    no hindsight on run length. See the run-length cap in
    `_confirming_run` for the second half of this guarantee.
    """
    if len(bars) < MIN_CONSECUTIVE + 1:
        return []

    signals: list[TfoSignal] = []
    pivot_window = bars[:LOD_SEARCH_WINDOW]

    # Long: low of day in first 4 bars
    low_idx = min(range(len(pivot_window)), key=lambda i: pivot_window[i].l)
    fire_bar_idx = low_idx + MIN_CONSECUTIVE
    if fire_bar_idx < len(bars):
        # Live-replay: "session low" is min over bars-so-far at the
        # moment the fire bar closes — NOT min over the full session.
        # The original "min over full session" check was hindsight that
        # silently dropped any TFO whose LOD got broken later in the
        # day; live emitted those candidates and the model never saw
        # them in training. Now both modes emit the same set.
        session_low_so_far = min(b.l for b in bars[: fire_bar_idx + 1])
        if abs(pivot_window[low_idx].l - session_low_so_far) < 1e-9:
            consec, strong, strong_indices = _confirming_run(bars, low_idx + 1, "long")
            if consec >= MIN_CONSECUTIVE and strong >= MIN_STRONG:
                score = consec * 1.0 + strong * 0.5
                signals.append(TfoSignal(
                    direction="long",
                    fire_ts=bars[fire_bar_idx].t,
                    pivot_index=low_idx,
                    fired_bar_index=fire_bar_idx,
                    consecutive_count=consec,
                    strong_count=strong,
                    score=score,
                    pivot_ts=bars[low_idx].t,
                    strong_bar_timestamps=tuple(bars[i].t for i in strong_indices),
                ))

    # Short: high of day in first 4 bars (mirror of long)
    high_idx = max(range(len(pivot_window)), key=lambda i: pivot_window[i].h)
    fire_bar_idx = high_idx + MIN_CONSECUTIVE
    if fire_bar_idx < len(bars):
        session_high_so_far = max(b.h for b in bars[: fire_bar_idx + 1])
        if abs(pivot_window[high_idx].h - session_high_so_far) < 1e-9:
            consec, strong, strong_indices = _confirming_run(bars, high_idx + 1, "short")
            if consec >= MIN_CONSECUTIVE and strong >= MIN_STRONG:
                score = consec * 1.0 + strong * 0.5
                signals.append(TfoSignal(
                    direction="short",
                    fire_ts=bars[fire_bar_idx].t,
                    pivot_index=high_idx,
                    fired_bar_index=fire_bar_idx,
                    consecutive_count=consec,
                    strong_count=strong,
                    score=score,
                    pivot_ts=bars[high_idx].t,
                    strong_bar_timestamps=tuple(bars[i].t for i in strong_indices),
                ))

    return signals
