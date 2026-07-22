# Follow / Counter Spot Selection — Design

## Context

`labouchere(spot, sequence, unit)` (`src/renderer/src/engine/strategy.ts`)
currently takes a **fixed** `spot: 'player' | 'banker'`. That spot is used for
two separate things that happen to coincide today:

1. **Which side to bet** — every hand, `bets[spot]` is set.
2. **Which history records drive sequence progression** —
   `deriveLabouchereSequence` filters `context.sessionHistory` down to
   records where `record.bets[spot] > 0`, then crosses off / appends to the
   Labouchere sequence based on `netChange`.

We're adding two more ways to pick the spot each hand, both still under the
Labouchere sequence: **Follow** (bet whatever side won the previous hand) and
**Counter** (bet the opposite side). Since the spot now varies hand to hand,
(1) and (2) must be decoupled: bet placement needs a *per-hand* spot, while
sequence progression needs to track wins/losses regardless of which side the
money was on.

Reference for existing behavior: `2026-07-14-labouchere-strategy-design.md`.

## Behavior for Follow / Counter

- **No bet on the first hand of a shoe.** Spot selection looks backward
  through `context.shoeHistory` (which already resets on every new shoe in
  both `simulateSession` and the Analyze tab's single-shoe history) for the
  most recent **non-tie** outcome.
  - If none exists yet (start of shoe, or only ties so far), the strategy
    returns an all-zero `Bets` for that hand — no wager, sequence untouched.
  - Once found: Follow bets that same side; Counter bets the opposite side.
  - Ties are transparent to spot selection — they neither reset the
    "last decisive outcome" nor themselves get bet on. A tie occurring while
    already betting doesn't stop the streak; the next hand still follows/
    counters the last decisive result.
- **Sequence progression stays on `context.sessionHistory`**, unchanged from
  today — it already carries across shoe boundaries, and that's out of scope
  to revisit here. A skipped (zero-wager) hand simply doesn't move the
  sequence, exactly like any zero-wager record does today.

## Core engine changes (`strategy.ts`)

- `deriveLabouchereSequence(initialSequence, unit, history)` — **drop the
  `spot` parameter.** Replace the `record.bets[spot]` filter with
  `record.bets.player + record.bets.banker` (the wager amount on whichever
  side was actually bet that hand). This is behavior-preserving for existing
  fixed-spot callers, since exactly one of `player`/`banker` is ever nonzero
  per record today.
- New type: `export type LabouchereSpotMode = 'player' | 'banker' | 'follow' | 'counter'`.
- `labouchere(spotMode: LabouchereSpotMode, sequence, unit): Strategy`:
  - Construction-time validation unchanged in spirit: still throws if given
    `'tie'` (not a valid `LabouchereSpotMode`, but keep a runtime guard since
    callers cross the JS/TS boundary via `<select>` values), empty sequence,
    non-positive sequence entries, or non-positive unit.
  - New private helper `resolveDynamicSpot(mode: 'follow' | 'counter', shoeHistory): BetSpot | null`:
    scans `shoeHistory` backward, skipping `'tie'` outcomes, and returns the
    followed/countered side, or `null` if no decisive hand yet.
  - Per-hand: resolve the actual spot (fixed passthrough for `'player'`/`'banker'`,
    or `resolveDynamicSpot` for `'follow'`/`'counter'`). Compute the bet
    amount from the replayed sequence exactly as today. If the resolved spot
    is `null`, return an all-zero `Bets`; otherwise place the amount on that
    spot.

## `analyze.ts` changes

- `analyzeLabouchereCompletions(history, spotMode, sequence, unit)` widens
  its `spot` parameter to `LabouchereSpotMode` and passes it straight through
  to `labouchere`. No other logic changes: completion detection already only
  depends on the sequence emptying out via `deriveLabouchereSequence`, which
  is now spot-agnostic. Because the Analyze tab already only ever receives a
  single shoe's history (`state.shoeHistory`, see `App.tsx`), the "reset
  every new shoe" rule falls out for free — `shoeHistory` and
  `sessionHistory` inside `analyzeLabouchereCompletions` are (as today) the
  same single array spanning the one shoe being analyzed.

## UI changes

- **`AnalyzePanel.tsx`** and **`SimulatePanel.tsx`**: the Labouchere Spot
  `<select>` gains two more `<option>`s, `follow` and `counter`, alongside
  the existing `player`/`banker`. No new form fields — sequence/unit inputs
  are shared across all four spot modes. The "Strategy" dropdown is
  unchanged (still just "Labouchere").
- State types for `spot` (`AnalyzePanel`) and `labouchereSpot`
  (`SimulatePanel`) widen from `'player' | 'banker'` to `LabouchereSpotMode`.

## Files touched

1. `src/renderer/src/engine/strategy.ts` — signature changes described above.
2. `src/renderer/src/engine/strategy.test.ts` — update existing
   `deriveLabouchereSequence` call sites for the dropped `spot` param; add
   coverage for: Follow bets the previous winner, Counter bets the previous
   loser's opposite, no bet on the first hand of a shoe, ties are skipped
   when scanning backward (both "only ties so far" → no bet, and "tie
   mid-streak" → streak continues off the last decisive hand), and the spot
   resets to "no bet until decisive" at a shoe boundary (empty `shoeHistory`
   even with non-empty `sessionHistory`).
3. `src/renderer/src/engine/analyze.ts` — widen the `spot` parameter type.
4. `src/renderer/src/engine/analyze.test.ts` — add a Follow/Counter
   completions case.
5. `src/renderer/src/components/AnalyzePanel.tsx` — add the two `<option>`s,
   widen state type.
6. `src/renderer/src/components/SimulatePanel.tsx` — same.
7. `AnalyzePanel.test.tsx` / `SimulatePanel.test.tsx` — cover selecting
   Follow/Counter and running an analysis/simulation end-to-end.

## Known tradeoff

Same O(n²)-per-session replay tradeoff as the original Labouchere design —
unchanged and out of scope here.
