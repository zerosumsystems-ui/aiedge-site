"""First-four-bar feature extraction for AAPL opening training.

This mirrors src/lib/opening-features.ts so the training/evaluation scripts
learn from the same Brooks-style measurements the screener displays.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


EPS = 1e-9

LABEL_ORDER = [
    "trend_open_long",
    "long_reversal",
    "no_trade",
    "short_reversal",
    "trend_open_short",
]

LABEL_TITLES = {
    "trend_open_long": "TFO Long",
    "long_reversal": "Long Rev",
    "no_trade": "No Trade",
    "short_reversal": "Short Rev",
    "trend_open_short": "TFO Short",
}

FEATURE_COLUMNS = [
    "barCount",
    "bullBars",
    "bearBars",
    "strongBullBars",
    "strongBearBars",
    "closeNearHighBars",
    "closeNearLowBars",
    "higherHighs",
    "higherLows",
    "lowerHighs",
    "lowerLows",
    "closesUp",
    "closesDown",
    "directionChanges",
    "avgBodyPct",
    "avgUpperTailPct",
    "avgLowerTailPct",
    "avgCloseLocation",
    "avgOverlapPct",
    "netMoveInAvgRange",
    "openingRangeInAvgRange",
    "firstTwoMoveInAvgRange",
    "finalBarBodyPct",
    "finalBarCloseLocation",
    "finalBarUpperTailPct",
    "finalBarLowerTailPct",
    "gapFromPriorCloseInAvgRange",
    "hoyDistanceInAvgRange",
    "loyDistanceInAvgRange",
    "openedAboveHoy",
    "openedBelowLoy",
]


@dataclass(frozen=True)
class OpeningFeatureSet:
    values: dict[str, float]
    scores: dict[str, int]
    read: str
    read_score: int
    read_confidence: int


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def clamp01(value: float) -> float:
    return clamp(value, 0.0, 1.0)


def score01(value: float) -> int:
    return round(clamp01(value) * 100)


def rounded(value: float, places: int = 4) -> float:
    return round(value, places)


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def ratio(count: int, total: int) -> float:
    return count / total if total > 0 else 0.0


def direction(open_price: float, close_price: float) -> int:
    if close_price > open_price:
        return 1
    if close_price < open_price:
        return -1
    return 0


def zero_values() -> dict[str, float]:
    return {column: 0.0 for column in FEATURE_COLUMNS}


def choose_read(scores: dict[str, int]) -> tuple[str, int, int]:
    sorted_scores = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    label, top_score = sorted_scores[0]
    second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0
    if top_score < 45:
        label = "no_trade"
    return label, scores[label], max(0, top_score - second_score)


def extract_opening_features(
    bars: list[dict[str, Any]],
    *,
    prior_close: float | None = None,
    prior_day_high: float | None = None,
    prior_day_low: float | None = None,
) -> OpeningFeatureSet:
    opening_bars = bars[:4]
    n = len(opening_bars)
    if n == 0:
        scores = {
            "trend_open_long": 0,
            "long_reversal": 0,
            "no_trade": 100,
            "short_reversal": 0,
            "trend_open_short": 0,
        }
        return OpeningFeatureSet(zero_values(), scores, "no_trade", 100, 100)

    ranges = [max(float(bar["h"]) - float(bar["l"]), EPS) for bar in opening_bars]
    avg_range = max(mean(ranges), EPS)
    session_high = max(float(bar["h"]) for bar in opening_bars)
    session_low = min(float(bar["l"]) for bar in opening_bars)
    span = max(session_high - session_low, EPS)

    bar_features = []
    for bar in opening_bars:
        open_price = float(bar["o"])
        high_price = float(bar["h"])
        low_price = float(bar["l"])
        close_price = float(bar["c"])
        bar_range = max(high_price - low_price, EPS)
        body = abs(close_price - open_price)
        body_high = max(open_price, close_price)
        body_low = min(open_price, close_price)
        bar_features.append(
            {
                "direction": direction(open_price, close_price),
                "range": rounded(bar_range),
                "bodyPct": rounded(body / bar_range),
                "upperTailPct": rounded((high_price - body_high) / bar_range),
                "lowerTailPct": rounded((body_low - low_price) / bar_range),
                "closeLocation": rounded((close_price - low_price) / bar_range),
            }
        )

    bull_bars = sum(1 for bar in bar_features if bar["direction"] == 1)
    bear_bars = sum(1 for bar in bar_features if bar["direction"] == -1)
    strong_bull_bars = sum(
        1
        for bar in bar_features
        if bar["direction"] == 1 and bar["bodyPct"] >= 0.55 and bar["closeLocation"] >= 0.65
    )
    strong_bear_bars = sum(
        1
        for bar in bar_features
        if bar["direction"] == -1 and bar["bodyPct"] >= 0.55 and bar["closeLocation"] <= 0.35
    )
    close_near_high_bars = sum(1 for bar in bar_features if bar["closeLocation"] >= 0.7)
    close_near_low_bars = sum(1 for bar in bar_features if bar["closeLocation"] <= 0.3)

    higher_highs = higher_lows = lower_highs = lower_lows = 0
    closes_up = closes_down = direction_changes = 0
    overlaps: list[float] = []

    for index in range(1, n):
        bar = opening_bars[index]
        prior = opening_bars[index - 1]
        if float(bar["h"]) > float(prior["h"]):
            higher_highs += 1
        if float(bar["l"]) > float(prior["l"]):
            higher_lows += 1
        if float(bar["h"]) < float(prior["h"]):
            lower_highs += 1
        if float(bar["l"]) < float(prior["l"]):
            lower_lows += 1
        if float(bar["c"]) > float(prior["c"]):
            closes_up += 1
        if float(bar["c"]) < float(prior["c"]):
            closes_down += 1

        current_direction = int(bar_features[index]["direction"])
        prior_direction = int(bar_features[index - 1]["direction"])
        if current_direction and prior_direction and current_direction != prior_direction:
            direction_changes += 1

        overlap_range = max(0.0, min(float(bar["h"]), float(prior["h"])) - max(float(bar["l"]), float(prior["l"])))
        denominator = max(min(ranges[index], ranges[index - 1]), EPS)
        overlaps.append(clamp01(overlap_range / denominator))

    first = opening_bars[0]
    last = opening_bars[-1]
    final_bar = bar_features[-1]
    first_two_close = opening_bars[min(1, n - 1)]["c"]

    values = zero_values()
    values.update(
        {
            "barCount": float(n),
            "bullBars": float(bull_bars),
            "bearBars": float(bear_bars),
            "strongBullBars": float(strong_bull_bars),
            "strongBearBars": float(strong_bear_bars),
            "closeNearHighBars": float(close_near_high_bars),
            "closeNearLowBars": float(close_near_low_bars),
            "higherHighs": float(higher_highs),
            "higherLows": float(higher_lows),
            "lowerHighs": float(lower_highs),
            "lowerLows": float(lower_lows),
            "closesUp": float(closes_up),
            "closesDown": float(closes_down),
            "directionChanges": float(direction_changes),
            "avgBodyPct": rounded(mean([bar["bodyPct"] for bar in bar_features])),
            "avgUpperTailPct": rounded(mean([bar["upperTailPct"] for bar in bar_features])),
            "avgLowerTailPct": rounded(mean([bar["lowerTailPct"] for bar in bar_features])),
            "avgCloseLocation": rounded(mean([bar["closeLocation"] for bar in bar_features])),
            "avgOverlapPct": rounded(mean(overlaps)),
            "netMoveInAvgRange": rounded((float(last["c"]) - float(first["o"])) / avg_range),
            "openingRangeInAvgRange": rounded(span / avg_range),
            "firstTwoMoveInAvgRange": rounded((float(first_two_close) - float(first["o"])) / avg_range),
            "finalBarBodyPct": float(final_bar["bodyPct"]),
            "finalBarCloseLocation": float(final_bar["closeLocation"]),
            "finalBarUpperTailPct": float(final_bar["upperTailPct"]),
            "finalBarLowerTailPct": float(final_bar["lowerTailPct"]),
            "gapFromPriorCloseInAvgRange": rounded((float(first["o"]) - prior_close) / avg_range)
            if prior_close is not None
            else 0.0,
            "hoyDistanceInAvgRange": rounded((prior_day_high - float(first["o"])) / avg_range)
            if prior_day_high is not None
            else 0.0,
            "loyDistanceInAvgRange": rounded((float(first["o"]) - prior_day_low) / avg_range)
            if prior_day_low is not None
            else 0.0,
            "openedAboveHoy": 1.0 if prior_day_high is not None and float(first["o"]) > prior_day_high else 0.0,
            "openedBelowLoy": 1.0 if prior_day_low is not None and float(first["o"]) < prior_day_low else 0.0,
        }
    )

    transitions = max(n - 1, 1)
    bull_ratio = ratio(bull_bars, n)
    bear_ratio = ratio(bear_bars, n)
    strong_bull_ratio = ratio(strong_bull_bars, n)
    strong_bear_ratio = ratio(strong_bear_bars, n)
    close_near_high_ratio = ratio(close_near_high_bars, n)
    close_near_low_ratio = ratio(close_near_low_bars, n)
    closes_up_ratio = ratio(closes_up, transitions)
    closes_down_ratio = ratio(closes_down, transitions)
    higher_high_ratio = ratio(higher_highs, transitions)
    higher_low_ratio = ratio(higher_lows, transitions)
    lower_high_ratio = ratio(lower_highs, transitions)
    lower_low_ratio = ratio(lower_lows, transitions)
    low_overlap = 1 - values["avgOverlapPct"]
    positive_move = clamp01(values["netMoveInAvgRange"] / 3)
    negative_move = clamp01(-values["netMoveInAvgRange"] / 3)

    trend_open_long = score01(
        0.16 * bull_ratio
        + 0.16 * strong_bull_ratio
        + 0.15 * closes_up_ratio
        + 0.13 * higher_high_ratio
        + 0.12 * higher_low_ratio
        + 0.13 * close_near_high_ratio
        + 0.08 * positive_move
        + 0.07 * low_overlap
    )
    trend_open_short = score01(
        0.16 * bear_ratio
        + 0.16 * strong_bear_ratio
        + 0.15 * closes_down_ratio
        + 0.13 * lower_high_ratio
        + 0.12 * lower_low_ratio
        + 0.13 * close_near_low_ratio
        + 0.08 * negative_move
        + 0.07 * low_overlap
    )

    first_half = bar_features[: min(2, n)]
    early_bear = mean([1.0 if bar["direction"] == -1 else 0.0 for bar in first_half])
    early_bull = mean([1.0 if bar["direction"] == 1 else 0.0 for bar in first_half])
    early_near_low = mean([1.0 if bar["closeLocation"] <= 0.35 else 0.0 for bar in first_half])
    early_near_high = mean([1.0 if bar["closeLocation"] >= 0.65 else 0.0 for bar in first_half])
    early_sell = 0.4 * early_bear + 0.3 * early_near_low + 0.3 * clamp01(-values["firstTwoMoveInAvgRange"] / 1.5)
    early_buy = 0.4 * early_bull + 0.3 * early_near_high + 0.3 * clamp01(values["firstTwoMoveInAvgRange"] / 1.5)
    final_bull_signal = (
        0.35 * (1.0 if final_bar["direction"] == 1 else 0.0)
        + 0.25 * final_bar["closeLocation"]
        + 0.2 * final_bar["bodyPct"]
        + 0.2 * final_bar["lowerTailPct"]
    )
    final_bear_signal = (
        0.35 * (1.0 if final_bar["direction"] == -1 else 0.0)
        + 0.25 * (1 - final_bar["closeLocation"])
        + 0.2 * final_bar["bodyPct"]
        + 0.2 * final_bar["upperTailPct"]
    )
    recovery_long = clamp01((float(last["c"]) - session_low) / span)
    recovery_short = clamp01((session_high - float(last["c"])) / span)

    long_reversal = score01(0.45 * early_sell + 0.4 * final_bull_signal + 0.15 * recovery_long)
    short_reversal = score01(0.45 * early_buy + 0.4 * final_bear_signal + 0.15 * recovery_short)

    mixed_direction = 1 - abs(bull_bars - bear_bars) / n
    small_net_move = clamp01(1 - abs(values["netMoveInAvgRange"]) / 2.2)
    tail_heavy = clamp01((values["avgUpperTailPct"] + values["avgLowerTailPct"]) / 0.75)
    low_trend_pressure = 1 - max(trend_open_long, trend_open_short) / 100
    no_trade = score01(
        0.3 * values["avgOverlapPct"]
        + 0.22 * mixed_direction
        + 0.2 * small_net_move
        + 0.15 * tail_heavy
        + 0.13 * low_trend_pressure
    )

    scores = {
        "trend_open_long": trend_open_long,
        "long_reversal": long_reversal,
        "no_trade": no_trade,
        "short_reversal": short_reversal,
        "trend_open_short": trend_open_short,
    }
    read, read_score, read_confidence = choose_read(scores)
    return OpeningFeatureSet(values, scores, read, read_score, read_confidence)
