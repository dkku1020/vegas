# Skip Bet After — Follow/Counter Support — Design

## Context

`labouchere(spotMode, sequence, unit, skipAfter?)`
(`src/renderer/src/engine/strategy.ts`) currently only allows `skipAfter`
for a *fixed* spot (`'player'`/`'banker'`); passing it with `'follow'` or
`'counter'` throws at construction time
(`2026-08-05-skip-bet-after-design.md`). Both `SimulatePanel.tsx` and
`AnalyzePanel.tsx` hide the "Skip bet after (losses)" field whenever the
selected spot is `'follow'`/`'counter'`, matching that restriction.

This extends skip-after to `'follow'`/`'counter'` too.

## Behavior

For `'follow'`/`'counter'`, the target spot itself changes every hand
(resolved from the prior decisive outcome via `resolveDynamicSpot`), so "N
losses on the spot" isn't literally meaningful the way it is for a fixed
spot. Instead, the loss streak tracks **the dynamic strategy's own
would-have-lost streak**: walk backward through `shoeHistory`, skipping
ties; for each decisive hand, recompute what `'follow'`/`'counter'` would
have bet at that point (using history strictly before that hand) and
compare to what actually happened. A match ends the streak (win). A
mismatch continues it (loss). Running out of a decisive predecessor to
compare against also ends the scan (nothing to evaluate).

This mirrors the fixed-spot rule exactly, just with a moving target instead
of a constant one — same tie-skipping, same "resume only on an outright
win" semantics, same reset at shoe boundaries (it's still scoped to
`shoeHistory`).

Example: spot = `'follow'`, skip-after = 3. If the shoe has been choppy
(alternating banker/player) for 3 hands straight — meaning "bet whatever
just hit" would have lost 3 times in a row — sit out. Resume the instant a
decisive outcome repeats the previous one (a follow bet would have won).

## Core engine changes (`strategy.ts`)

- Remove the construction-time throw for `skipAfter` combined with
  `'follow'`/`'counter'`. The "must be a positive integer" validation
  stays, for all spot modes.
- New helper:
  ```ts
  function countDynamicLossStreak(
    mode: 'follow' | 'counter',
    shoeHistory: SimHandRecord[]
  ): number
  ```
  Reduces `shoeHistory` to just the decisive (non-tie) outcomes in order,
  then scans that list backward: at position `i`, the predicted bet is
  `decisive[i - 1]` (follow) or its opposite (counter) — the same rule
  `resolveDynamicSpot` uses, just applied to the already-filtered list
  instead of re-scanning history per candidate. A match (`decisive[i] ===
  predicted`) stops the scan (win); a mismatch increments the streak and
  continues to `i - 1`. Reaching index 0 (no predecessor to compare
  against) also stops the scan. This is a single O(n) pass — no repeated
  re-derivation of the predicted spot per candidate hand.
- In the per-hand closure: after resolving the actual spot to bet
  (unchanged), if `skipAfter` is set, compute the streak with
  `countLossStreak` for fixed spots or `countDynamicLossStreak` for
  `'follow'`/`'counter'`, and skip (all-zero `Bets`) if `>= skipAfter`,
  exactly as today for the fixed case.

## `analyze.ts` changes

`bets[spotMode] === 0` (the current skipped-detection check) doesn't work
for `'follow'`/`'counter'` — `spotMode` isn't a key of `Bets` there, and a
zero-wager hand can also mean "no decisive predecessor yet" rather than an
actual skip-after trigger. Replace the check with one that works for all
four spot modes and distinguishes the two zero-wager cases:

```ts
const totalWagered = bets.player + bets.banker + bets.tie
const hasResolvableSpot =
  spotMode === 'player' ||
  spotMode === 'banker' ||
  sessionHistory.some((r) => r.outcome !== 'tie') // history before hand i

if (skipAfter !== undefined && totalWagered === 0 && hasResolvableSpot) {
  skipped.push(i)
}
```

`sessionHistory` at the point this check runs already holds only the hands
strictly before `i` (the current hand's record hasn't been pushed yet). For
`'follow'`/`'counter'`, a zero-wager hand only means "no decisive
predecessor" when no non-tie outcome has occurred yet at all — once at
least one has, `resolveDynamicSpot` always resolves to a real spot, so a
zero-wager hand past that point must be an actual skip-after trigger. This
mirrors `resolveDynamicSpot`'s own null condition without needing to
export it from `strategy.ts`.

## UI changes

### `SimulatePanel.tsx` / `AnalyzePanel.tsx`

- Both currently gate the "Skip bet after (losses)" field and the
  parsed-value pass-through on `spot === 'player' || spot === 'banker'`.
  Drop that condition — render the field and pass `parseSkipAfter(...)`
  for all four spot modes.

No other UI changes — `BigRoad`'s `skippedIndices` prop already renders
whatever index set it's given, regardless of which spot mode produced it.

## Files touched

1. `src/renderer/src/engine/strategy.ts` — drop the follow/counter throw,
   add `countDynamicLossStreak`, wire it into the per-hand skip check.
2. `src/renderer/src/engine/strategy.test.ts` — replace the two "throws
   when combined with follow/counter" tests with: skip triggers after N
   dynamic losses for follow, for counter; doesn't trigger early; ties
   don't count; resumes only on an outright (dynamic) win; resets at shoe
   boundary.
3. `src/renderer/src/engine/analyze.ts` — generalize the skipped-detection
   check.
4. `src/renderer/src/engine/analyze.test.ts` — skipped indices reported
   correctly for follow/counter; first hand(s) with no decisive
   predecessor are not misreported as skipped.
5. `src/renderer/src/components/SimulatePanel.tsx` — remove the
   player/banker gate on the skip-after field/pass-through.
6. `src/renderer/src/components/SimulatePanel.test.tsx` — field now
   visible for follow/counter too.
7. `src/renderer/src/components/AnalyzePanel.tsx` — same gate removal.
8. `src/renderer/src/components/AnalyzePanel.test.tsx` — same visibility
   update.

## Known tradeoff

`countDynamicLossStreak` is a single O(n) pass per skip-check call, called
once per hand — O(n²) per shoe, the same order `countLossStreak` already
costs today. No new complexity class introduced.
