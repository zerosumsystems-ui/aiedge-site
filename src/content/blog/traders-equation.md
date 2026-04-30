---
title: "The trader's equation"
date: 2026-04-30
description: "Brooks' framework for deciding whether to take a trade — why a 60% directional read isn't an edge until you also know reward and risk."
tags: [brooks, math, trader-equation]
---

A common beginner mistake is to read a chart, conclude "this is going up," and place a trade. The read may even be right more often than not. The trade can still be a loser in expectation. Al Brooks' *Trading Price Action: Trading Ranges* (Wiley, 2012) makes the point with a single line:

> To take a trade, you must believe that the probability of success times the potential reward is greater than the probability of failure times the risk.

That is the trader's equation. Three numbers — probability, reward, risk — and you do not control any one of them in isolation.

## Probability, decomposed

Brooks splits "probability" into two distinct ideas, and most confusion in retail price-action discussions comes from collapsing them.

**Directional probability** is the chance the market goes up `X` ticks before it goes down `X` ticks (or vice versa). It is symmetric by construction. In Brooks' words:

> If you are looking at an equidistant move up and down, it hovers around 50 percent most of the time, which means that there is a 50–50 chance that the market will move up by X ticks before it moves down X ticks.

That number does not change because you have a strong opinion. It changes because the market is in a different state: a strong spike pushes it to 60% or sometimes 70%; the middle of a trading range pulls it back to 50.

**Probability of success** is different. It is the chance your *specific trade* hits its profit target before its stop. The two are equal only when the target and the stop are equidistant from entry. The moment you set a 2R target and a 1R stop, your probability of success is no longer the directional probability — it has to be discounted for the asymmetry.

## The equation in practice

Take Brooks' worked example. You believe a strong spike has put the market in a 60% directional regime. You go long with a stop one tick below the bottom of the spike — say, three points away. What does the math demand of your target?

- Risk = 3 points
- Probability of success ≥ 60%, *only if reward ≤ risk*
- For reward = 3 points (1:1): 0.60 × 3 − 0.40 × 3 = +0.60 expected
- For reward = 6 points (2:1): 0.60 × 6 − 0.40 × 3 = +2.40 expected — but only if probability of hitting 6 points before 3 points down is still 60%, which it is not

Brooks states the constraint plainly:

> Mathematics dictates that your belief (that the strategy will be profitable when the probability is 60 percent) will be true only if the reward is at least as big as the risk.

Read that the other way and it stings: a setup you read at 60% directional only earns you a positive equation when reward ≥ risk. Take a 1:2 risk-reward on the same setup and you need closer to 67% to break even. Take 1:3 and you need 75%. Most "60% reads" are nowhere near that.

## Why edges are small

Brooks' definition of an edge is concise:

> A setup with a positive trader's equation. The trader has a mathematical advantage if he trades the setup. Edges are always small and fleeting because they need someone on the other side, and the market is filled with smart traders who won't allow an edge to be big and persistent.

This is why "the market is mostly random" and "the market has tradeable structure" are both true. Outside of strong spikes and the edges of well-defined trading ranges, the directional probability is close to 50–50 and no choice of stop and target produces a positive equation. The structure exists in narrow windows: spike continuation, the bottom of an established range, the first pullback after a strong breakout.

Brooks repeats two numbers throughout the book that are worth committing to memory:

- **About 80% of trend-reversal attempts fail** in a strong trend. This is why "wait for the reversal to evolve into a pullback and enter with the trend" is the default.
- **About 80% of trading-range breakouts fail.** This is why fading the extremes of a range usually has a better equation than chasing the breakout bar.

Both are statements about probability of success at specific structural moments — not always-in claims about the chart.

## Why a 65% directional prior isn't automatically an edge

This is where the math becomes load-bearing for backtesting. Suppose you find a setup whose 12-bar opening structure points up 65% of the time on an end-of-day basis. The natural reaction is to assume there is a 1:1 trade in there somewhere. There may not be. The 65% number is a *directional probability*, not a *probability of hitting a target before hitting a stop*.

If your stop has to be wider than your target — for example, because the setup tends to wick against you before resolving — the probability of success on the trade can be well under 50% even though the directional read is 65%. You earn the directional edge only at convention combinations where the asymmetry of reward and risk does not eat it. On a five-minute bar, with realistic ATR-scaled stops, those combinations are narrower than they look on paper.

The equation is the constraint. Find the (target, stop) pair that survives it, or accept that the setup does not produce a tradeable edge even when the directional read is real.

## What this looks like operationally

1. **Read the structure first, not the trade.** Where in the chart's life is the market? Spike, channel, top of range, middle of range? That sets the directional probability.
2. **Pick a stop that the structure can defend.** Below the spike, beyond the failed reversal, below the higher low. Not a fixed dollar amount, not a fixed ATR multiple chosen for convenience.
3. **Pick the target the structure offers.** Measured-move projections, the opposite end of the range, the prior swing.
4. **Compute the equation.** If `p × reward < (1−p) × risk`, the trade is not there at this entry. Wait for a better one or stand aside.

Brooks' rule of thumb when uncertain: assume 50%. When confident, assume 60%. Anything beyond 60% is rarely justified outside a spike, and even there it decays as the move extends.

---

*Source: Al Brooks, "Trading Price Action: Trading Ranges" (John Wiley & Sons, 2012). Quoted definitions and the worked spike example are paraphrased and excerpted from Chapter 25 ("Mathematics of Trading: Should I Take This Trade?") and the book's introductory glossary.*
