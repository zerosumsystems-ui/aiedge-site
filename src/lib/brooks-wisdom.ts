/**
 * Hardcoded Al Brooks wisdom — hallmarks, guidelines, and principles.
 *
 * Every snippet here is quoted verbatim from primary-source Brooks book
 * material that already lives in this repo:
 *   - the Brooks Tour narrations in public/brooks-tour/<slug>/data.json
 *   - the direct quotes in src/content/blog/traders-equation.md
 *
 * Nothing is paraphrased or invented. `source` cites the book and figure
 * the sentence was lifted from so each snippet stays verifiable.
 */

export type WisdomKind = 'hallmark' | 'guideline' | 'principle'

export interface WisdomSnippet {
  id: string
  /** Verbatim sentence from the book. */
  text: string
  kind: WisdomKind
  source: {
    book: string
    /** e.g. "Fig 6.14" — omitted for prose quoted without a figure. */
    figure?: string
  }
}

export interface WisdomSection {
  id: string
  title: string
  blurb: string
  snippets: WisdomSnippet[]
}

const BOOK_TRENDS = 'Trading Price Action: Trends'
const BOOK_RANGES = 'Trading Price Action: Trading Ranges'
const BOOK_REVERSALS = 'Trading Price Action: Reversals'
const BOOK_READING = 'Reading Price Charts Bar by Bar'

export const WISDOM_SECTIONS: WisdomSection[] = [
  {
    id: 'traders-equation',
    title: "The trader's equation",
    blurb:
      'Quoted directly from Trading Price Action: Trading Ranges. The math that decides whether a read is actually an edge.',
    snippets: [
      {
        id: 'eq-definition',
        text: 'To take a trade, you must believe that the probability of success times the potential reward is greater than the probability of failure times the risk.',
        kind: 'principle',
        source: { book: BOOK_RANGES },
      },
      {
        id: 'eq-directional',
        text: 'If you are looking at an equidistant move up and down, it hovers around 50 percent most of the time, which means that there is a 50–50 chance that the market will move up by X ticks before it moves down X ticks.',
        kind: 'principle',
        source: { book: BOOK_RANGES },
      },
      {
        id: 'eq-reward-risk',
        text: 'Mathematics dictates that your belief (that the strategy will be profitable when the probability is 60 percent) will be true only if the reward is at least as big as the risk.',
        kind: 'guideline',
        source: { book: BOOK_RANGES },
      },
      {
        id: 'eq-edge',
        text: "A setup with a positive trader's equation. The trader has a mathematical advantage if he trades the setup. Edges are always small and fleeting because they need someone on the other side, and the market is filled with smart traders who won't allow an edge to be big and persistent.",
        kind: 'principle',
        source: { book: BOOK_RANGES },
      },
    ],
  },
  {
    id: 'trend-strength',
    title: 'Trend strength',
    blurb: 'What a strong trend looks like, and how the bulls behave as it ages.',
    snippets: [
      {
        id: 'no-tail-strength',
        text: 'A bar with no tail at either end in a strong trend is a sign of strength, and traders should enter with trend on its breakout.',
        kind: 'hallmark',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'deeper-pullbacks',
        text: 'As a trend wears on, the bulls typically will want deeper pullbacks before looking to buy again.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'trend-this-strong',
        text: 'When the trend is this strong, you have to believe that the market will soon be higher.',
        kind: 'principle',
        source: { book: BOOK_RANGES, figure: 'Fig 31.4' },
      },
    ],
  },
  {
    id: 'signal-bars',
    title: 'Signal bars',
    blurb: 'Reading doji, outside, and small reversal bars — and the traps they set.',
    snippets: [
      {
        id: 'outside-bars-trap',
        text: 'Outside bars in new trends often trap traders out of great trades because they happen so quickly.',
        kind: 'hallmark',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'doji-shorts',
        text: 'Doji bars are never good signal bars for shorts in strong bulls, but they are acceptable signal bars for shorts in trading ranges, depending on the context.',
        kind: 'guideline',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'small-reversal-bars',
        text: 'Small reversal bars are rarely good, and when one forms in a tight trading range, it should not be looked at as a reversal bar because there is nothing to reverse.',
        kind: 'guideline',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'first-attempt',
        text: 'The market rarely reverses very far on the first attempt, especially when the signal bar has a close in the middle instead of at its low.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
    ],
  },
  {
    id: 'reversals',
    title: 'Reversals',
    blurb: 'Second legs, lower lows, and when a spike is the opposite of what it looks like.',
    snippets: [
      {
        id: 'second-legs',
        text: 'Second legs are often reversals.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'two-legged-lower-low',
        text: 'A two-legged Lower Low is usually good for at least a scalp.',
        kind: 'principle',
        source: { book: BOOK_READING, figure: 'Fig 1.18' },
      },
      {
        id: 'bear-spike-buy',
        text: 'A bear spike can be a buying opportunity.',
        kind: 'hallmark',
        source: { book: BOOK_REVERSALS, figure: 'Fig 9.16' },
      },
    ],
  },
  {
    id: 'trading-ranges',
    title: 'Trading ranges & the moving average',
    blurb: 'How ranges resolve around the moving average, and how to size a trade inside one.',
    snippets: [
      {
        id: 'tr-below-ma',
        text: 'Whenever there is a trading range just below the moving average, the odds favor a downside breakout.',
        kind: 'hallmark',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'tight-tr-below-ma',
        text: 'A tight trading range below the moving average usually breaks out to the downside.',
        kind: 'hallmark',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'sellers-at-ma',
        text: 'There are always sellers on any test of the moving average from below.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'give-it-room',
        text: 'If you are going to take a trade in a tight trading range, you have to give it a little room.',
        kind: 'guideline',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
    ],
  },
  {
    id: 'climaxes-spikes',
    title: 'Climaxes, spikes & measured moves',
    blurb: 'What a spike or climax leads to next, and the targets it projects.',
    snippets: [
      {
        id: 'all-breakouts',
        text: 'All breakouts are spikes and climaxes.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'breakout-spike-mm',
        text: 'A breakout spike often leads to a measured move down.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'spike-down-mm',
        text: 'Whenever there is a strong spike down, it is usually followed by a measured move down based on some aspect of the spike, usually the distance from the open or high of the first bar to the close or low of the last bar of the spike.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'climax-after-trend',
        text: 'When a climax occurs after a trend has been going on for many bars, the odds of a two-legged sideways to down correction lasting at least 10 bars increase.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'second-buy-climax',
        text: 'A second consecutive buy climax usually results in at least a two-legged correction that penetrates the moving average and lasts at least an hour.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'second-sell-climax',
        text: 'A second consecutive sell climax usually leads to at least a two-legged pullback.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'first-pause',
        text: 'The first pause in a strong trend is usually a successful short scalp, even in a strong bear trend, but it might become a final flag and lead to a correction up.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'ma-gap-bar',
        text: 'A moving average gap bar often leads to the final leg of the trend before the market has a larger pullback and even a reversal.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
    ],
  },
  {
    id: 'channels-scaling',
    title: 'Channels & scaling',
    blurb: 'How to read a channel, and the discipline scaling in demands.',
    snippets: [
      {
        id: 'bear-channel-bull-flag',
        text: 'A bear channel should be thought of as a bull flag.',
        kind: 'principle',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
      {
        id: 'never-scale-against',
        text: 'When a channel is strong, you should never scale in against the trend.',
        kind: 'guideline',
        source: { book: BOOK_RANGES, figure: 'Fig 31.4' },
      },
      {
        id: 'scale-in-pullback',
        text: 'When the moving average is steeply up, traders will buy a pullback to the moving average and scale in lower.',
        kind: 'principle',
        source: { book: BOOK_RANGES, figure: 'Fig 31.5' },
      },
      {
        id: 'reversal-first-touch',
        text: "When there is a possible reversal, many traders don't buy the first touch of the moving average. Instead, they will start to buy below the moving average.",
        kind: 'guideline',
        source: { book: BOOK_RANGES, figure: 'Fig 31.5' },
      },
    ],
  },
  {
    id: 'trendlines-risk',
    title: 'Trendlines & risk',
    blurb: 'Which trendlines matter, what their breaks set up, and how bar size sets your stop.',
    snippets: [
      {
        id: 'hour-trendline',
        text: 'Any trendline lasting about an hour or so is more significant.',
        kind: 'hallmark',
        source: { book: BOOK_READING, figure: 'Fig 2.7' },
      },
      {
        id: 'small-trendlines',
        text: 'Small trendlines in strong trends, even when drawn using adjacent bars, often have failure tests (failed breakouts) that set up good With Trend entries.',
        kind: 'hallmark',
        source: { book: BOOK_READING, figure: 'Fig 2.7' },
      },
      {
        id: 'wait-for-trend-bars',
        text: 'When bars are small doji bars, it is usually best to wait for bigger trend bars before taking more trades.',
        kind: 'guideline',
        source: { book: BOOK_READING, figure: 'Fig 2.7' },
      },
      {
        id: 'risk-greater',
        text: 'When the risk is greater, it is better to not take the trade and to wait for a strong setup.',
        kind: 'guideline',
        source: { book: BOOK_TRENDS, figure: 'Fig 6.14' },
      },
    ],
  },
]

export const WISDOM_SNIPPET_COUNT = WISDOM_SECTIONS.reduce(
  (n, s) => n + s.snippets.length,
  0,
)
