# Skip Bet After — Design

## Context

`labouchere(spotMode, sequence, unit)` (`src/renderer/src/engine/strategy.ts`)
currently bets on the resolved spot every single hand. We're adding an
opt-in **"skip bet after"** rule: for a *fixed* spot (`'player'` or
`'banker'` only — not `'follow'`/`'counter'`), once that spot has lost N
hands in a row, sit out (bet nothing) until the spot wins outright, then
resume betting normally.

Example: spot = `'player'`, skip-after = 4. After 4 consecutive banker
outcomes, stop betting on player. Keep sitting out through any further
banker (or tie) outcomes. The moment `'player'` wins, resume betting the
next hand.

References: `2026-07-14-labouchere-strategy-design.md`,
`2026-07-22-follow-counter-spot-design.md` (shoe-boundary reset convention
reused here).

## Behavior

- `skipAfter` is an optional positive integer.
- **Only valid for a fixed spot.** Combining it with `'follow'`/`'counter'`
  is a construction-time error — those spots change hand to hand, so "N
  losses on the spot" isn't well defined.
- **Loss streak:** scan `context.shoeHistory` backward from the current
  hand, skipping ties entirely (they neither count as a loss nor reset the
  streak). Count consecutive hands whose outcome is *not* the chosen spot.
  Hitting a hand whose outcome *is* the chosen spot stops the scan — the
  streak below that point is 0.
- If the streak is `>= skipAfter`, the strategy returns an all-zero `Bets`
  for that hand (no wager). Otherwise it bets normally, exactly as today.
- **Resume condition:** only an outright win on the chosen spot ends the
  sit-out. A tie while sitting out does not resume betting.
- **Shoe boundaries:** the streak is scoped to `shoeHistory`, which already
  resets on every new shoe (both in `simulateSession` and the Analyze tab's
  single-shoe history) — so a new shoe always starts with a clean streak.
  No extra bookkeeping needed; this falls out of reusing the same array
  `follow`/`counter` already scans.
- **Sequence progression is unaffected.** `deriveLabouchereSequence` already
  ignores zero-wager hands, so a skipped hand neither advances nor
  regresses the Labouchere sequence — it's frozen until betting resumes.

## Core engine changes (`strategy.ts`)

- `labouchere(spotMode: LabouchereSpotMode, sequence: number[], unit: number, skipAfter?: number): Strategy`
- Construction-time validation, alongside the existing checks:
  - Throws if `skipAfter !== undefined` and `spotMode` is `'follow'` or
    `'counter'`: `Skip-after is only valid for a fixed 'player' or 'banker' spot`.
  - Throws if `skipAfter !== undefined` and it isn't a positive integer:
    `Skip-after must be a positive integer, got ${skipAfter}`.
- New helper:
  ```ts
  function countLossStreak(spot: BetSpot, shoeHistory: SimHandRecord[]): number
  ```
  Scans `shoeHistory` backward, skipping `'tie'` outcomes, counting
  consecutive non-`spot` outcomes until it hits an outcome equal to `spot`
  or runs out of history.
- Per-hand, after resolving the actual spot (unchanged logic for
  `'player'`/`'banker'`/`'follow'`/`'counter'`): if `skipAfter` is set and
  the resolved spot is the fixed `spotMode` (i.e. we're in fixed-spot mode,
  not follow/counter — enforced at construction so this is always true when
  `skipAfter` is set), compute `countLossStreak(spot, context.shoeHistory)`.
  If it's `>= skipAfter`, return an all-zero `Bets` immediately, before the
  existing bet-amount computation runs.

## `analyze.ts` changes

- `analyzeLabouchereCompletions(history, spotMode, sequence, unit, skipAfter?)`
  return type widens from `number[]` to:
  ```ts
  { completions: number[]; skipped: number[] }
  ```
- Inside the existing per-hand loop, after computing `bets` for hand `i`: if
  `skipAfter` is set and `spotMode` is `'player'`/`'banker'` and
  `bets[spotMode] === 0`, push `i` onto `skipped`. Completion detection is
  unchanged.
- The single caller, `AnalyzePanel.tsx`, updates to the new return shape.

## UI changes

### `AnalyzePanel.tsx`

- New state `skipAfter: string`, following the same raw-text-input pattern
  as `sequence`/`unit`.
- New field, rendered **only** when `spot === 'player' || spot === 'banker'`:
  label "Skip bet after (losses)", text input, placeholder like `e.g. 4`.
- On submit: blank → `undefined` (feature off). Non-blank → must parse to a
  positive integer, else throw `Skip bet after must be a positive integer, got "X"`
  and surface it through the existing try/catch → `setError` path.
- Pass the parsed value into `analyzeLabouchereCompletions`; store both
  `completions` and `skipped` from the result.
- Results: `BigRoad` gets `skippedIndices={new Set(result.skipped)}`. Add a
  summary line: "N hands skipped" next to the existing completions count.
- Switching spot to `'follow'`/`'counter'` hides the field but does **not**
  clear its value — switching back to `'player'`/`'banker'` restores it.
  The value is simply not sent to the engine call while spot is
  follow/counter.

### `SimulatePanel.tsx`

- Same `skipAfter` state and parsing. Field renders only when
  `strategyType === 'labouchere'` **and**
  `labouchereSpot === 'player' || labouchereSpot === 'banker'` (hidden for
  Flat Bet and for Follow/Counter).
- Passed into the `labouchere(...)` construction call the same way. No
  results-panel changes — Simulate has no chart to annotate.

### `BigRoad.tsx` / `BigRoad.css`

- New optional prop `skippedIndices?: Set<number>`, using the same
  index → grid-position mapping already used for `highlightIndices`.
- Matching cells get an added class `big-road__cell--skipped`.
- CSS: `.big-road__cell--skipped .big-road__circle { opacity: 0.35; }` —
  dims the outcome marker without hiding it, visually distinct from the
  yellow `--highlight` background used for sequence completions.

## Files touched

1. `src/renderer/src/engine/strategy.ts` — `labouchere()` new param,
   validation, `countLossStreak` helper.
2. `src/renderer/src/engine/strategy.test.ts` — loss-streak counting (ties
   ignored), skip triggers at threshold, resumes only on outright win (not
   tie), resets at shoe boundary, validation errors (skip-after combined
   with follow/counter, skip-after < 1 or non-integer).
3. `src/renderer/src/engine/analyze.ts` — new `skipAfter` param, widened
   return type.
4. `src/renderer/src/engine/analyze.test.ts` — skipped indices reported
   correctly; completions detection unaffected by a skip mid-run.
5. `src/renderer/src/components/AnalyzePanel.tsx` — new field, conditional
   visibility, parsing/validation, results wiring.
6. `src/renderer/src/components/AnalyzePanel.test.tsx` — field visibility
   toggles with spot, validation error, skipped hands rendered on the
   board.
7. `src/renderer/src/components/SimulatePanel.tsx` — same field, gated on
   Labouchere + player/banker spot.
8. `src/renderer/src/components/SimulatePanel.test.tsx` — field visibility
   toggles with strategy type and spot.
9. `src/renderer/src/components/BigRoad.tsx` / `BigRoad.css` —
   `skippedIndices` prop and dimmed styling.
10. `src/renderer/src/components/BigRoad.test.tsx` — skipped cell gets the
    new class.

## Known tradeoff

Loss-streak is recomputed by re-scanning `shoeHistory` backward on every
hand — an O(n) scan per hand within a shoe. This sits alongside the
existing O(n²)-per-session tradeoff already accepted for Labouchere
sequence replay (see `2026-07-14-labouchere-strategy-design.md`) and isn't
a new concern at the history sizes this app deals with.
