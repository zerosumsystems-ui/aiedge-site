"""Pure TFO feature extraction.

Mirror of tfo_detector.py's role for features: a stable, side-effect-free
module callable from both backfill (historical sweep) and live (Fly
aggregator). No Supabase, no Databento, no HTTP. Caller hands in bars +
the detection's pivot/run fields; we return the feature dict that the
model was trained on.

Critical invariant: this is the ONE place feature extraction happens.
The same code path runs at backfill time and at live fire time.
Otherwise the model trained on backfill features lies when live fires
under a slightly different formula. The parity test
(scripts/tfo_features_test.py) verifies byte-equal output against the
snapshot of features the prior in-place extractor produced.

Feature order is locked to FEATURE_KEYS — append new keys, never reorder.
"""

from __future__ import annotations

import math
from typing import Sequence

# Re-export the Bar5m shape from the detector so both modules speak the
# same type. Keeping the import cheap (pure stdlib) means we can import
# this module from the Fly container without dragging in databento etc.
from tfo_detector import Bar5m  # noqa: F401


# Order is locked. Adding a feature appends to the end and bumps model
# version. NEVER reorder or remove without retraining + redeploy.
FEATURE_KEYS: tuple[str, ...] = (
    "fire_bar_body_ratio",
    "fire_bar_close_position",
    "fire_bar_upper_tail",
    "fire_bar_lower_tail",
    "fire_bar_range_pct",
    "fire_bar_vs_avg_range",
    "fire_bar_vs_avg_volume",
    "dist_from_open_pct",
    "confirming_avg_body_ratio",
    "confirming_avg_close_position",
    "bars_since_open",
    "consecutive_count",
    "strong_count",
    "strong_fraction",
)


def _bar_body_ratio(b: dict) -> float:
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.0
    return abs(float(b["c"]) - float(b["o"])) / rng


def _bar_close_position(b: dict) -> float:
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.5
    return (float(b["c"]) - float(b["l"])) / rng


def _bar_upper_tail(b: dict) -> float:
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.0
    return (float(b["h"]) - max(float(b["o"]), float(b["c"]))) / rng


def _bar_lower_tail(b: dict) -> float:
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.0
    return (min(float(b["o"]), float(b["c"])) - float(b["l"])) / rng


def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    if not math.isfinite(b) or b == 0:
        return default
    return a / b


def extract_features_for_fire(
    bars: Sequence[dict],
    *,
    fire_ts: int,
    pivot_index: int | None,
    consecutive_count: int,
    strong_count: int,
) -> dict | None:
    """Compute the V1 feature vector for a TFO fire.

    bars             — full session 5min RTH bars, chronological. Each
                       is a dict with keys t,o,h,l,c,v (the /api/bars
                       and Databento shapes already match).
    fire_ts          — epoch seconds of the fire bar (3rd confirming).
    pivot_index      — bar index of LOD/HOD. None falls back to 0 (treats
                       the entire pre-fire window as confirming).
    consecutive_count — total in-direction run after pivot.
    strong_count     — Brooks-strong subset of that run.

    Returns the feature dict whose keys equal FEATURE_KEYS (in order),
    or None if there aren't enough bars to compute meaningfully (no fire
    bar in the input, or fire is the very first bar of session).

    All features are pre-fire-bar-inclusive — nothing from after the fire
    leaks in. The detection fields (consecutive/strong counts, pivot)
    are themselves pre-fire by definition.
    """
    fired_idx = next((i for i, b in enumerate(bars) if int(b["t"]) == fire_ts), None)
    if fired_idx is None or fired_idx < 1:
        return None

    fire = bars[fired_idx]
    open_bar = bars[0]
    pre_fire = bars[: fired_idx + 1]
    confirming_slice_start = (pivot_index or 0) + 1
    confirming = bars[confirming_slice_start : fired_idx + 1] if pivot_index is not None else pre_fire

    pre_ranges = [float(b["h"]) - float(b["l"]) for b in pre_fire]
    avg_range = sum(pre_ranges) / len(pre_ranges) if pre_ranges else 0.0
    fire_range = float(fire["h"]) - float(fire["l"])

    pre_vols = [float(b.get("v") or 0) for b in pre_fire[:-1]]
    avg_vol_pre = sum(pre_vols) / len(pre_vols) if pre_vols else 0.0
    fire_vol = float(fire.get("v") or 0)

    session_open = float(open_bar["o"])
    dist_from_open_pct = _safe_div(float(fire["c"]) - session_open, session_open) * 100.0

    fb_body = _bar_body_ratio(fire)
    fb_close_pos = _bar_close_position(fire)
    fb_upper_tail = _bar_upper_tail(fire)
    fb_lower_tail = _bar_lower_tail(fire)

    if confirming:
        avg_body_ratio = sum(_bar_body_ratio(b) for b in confirming) / len(confirming)
        avg_close_pos = sum(_bar_close_position(b) for b in confirming) / len(confirming)
    else:
        avg_body_ratio = 0.0
        avg_close_pos = 0.5

    return {
        "fire_bar_body_ratio": round(fb_body, 4),
        "fire_bar_close_position": round(fb_close_pos, 4),
        "fire_bar_upper_tail": round(fb_upper_tail, 4),
        "fire_bar_lower_tail": round(fb_lower_tail, 4),
        "fire_bar_range_pct": round(_safe_div(fire_range, float(fire["c"])) * 100, 4),
        "fire_bar_vs_avg_range": round(_safe_div(fire_range, avg_range), 4),
        "fire_bar_vs_avg_volume": round(_safe_div(fire_vol, avg_vol_pre), 4),
        "dist_from_open_pct": round(dist_from_open_pct, 4),
        "confirming_avg_body_ratio": round(avg_body_ratio, 4),
        "confirming_avg_close_position": round(avg_close_pos, 4),
        "bars_since_open": fired_idx,
        "consecutive_count": int(consecutive_count or 0),
        "strong_count": int(strong_count or 0),
        "strong_fraction": round(
            _safe_div(int(strong_count or 0), int(consecutive_count or 1)),
            4,
        ),
    }
