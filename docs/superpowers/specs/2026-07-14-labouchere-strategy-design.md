# Labouchere Betting Strategy — Design

## Context

The simulation engine (`src/renderer/src/engine/`) models a `Strategy` as a pure
function `(context: StrategyContext) => Bets`, where `StrategyContext` carries
the current `bankroll`, `shoeHistory` (resets each shoe), and `sessionHistory`
(accumulates for the whole session). The only existing strategy is `flatBet`,
which ignores history entirely.

`runSimulation` runs many independent trials, but passes the **same strategy
instance** into `simulateSession` for every trial:

```ts
for (let i = 0; i < trials; i++) {
  trialResults.push(simulateSession({ strategy, ... }))
}
```

This means a strategy **must not** keep mutable state in a closure — any such
state would leak between otherwise-independent trials. `flatBet` is safe
because it's stateless. A Labouchere strategy is not naturally stateless (it
tracks a shrinking/growing sequence across hands), so it must derive its
current state by replaying `context.sessionHistory` on every call rather than
mutating a captured variable.

## Goal

Add a `labouchere` strategy to `strategy.ts`, covered by tests, and wire it
into `SimulatePanel` as a selectable strategy type alongside Flat Bet.

## Algorithm

Reference: https://wizardofodds.com/gambling/labouchere/

`labouchere(spot: 'player' | 'banker', sequence: number[], unit: number): Strategy`

- **Construction-time validation** (throws immediately, mirroring
  `runSimulation`'s `trials < 1` check):
  - `spot === 'tie'` → throw (Labouchere assumes an even-money-ish bet; Tie
    pays 8:1 and isn't a fit).
  - `sequence.length === 0` or any entry `<= 0` → throw.
  - `unit <= 0` → throw.

- **Per-hand bet computation:**
  1. Reconstruct the *current* sequence by replaying `context.sessionHistory`,
     considering only records where `bets[spot] > 0` (hands where this
     strategy actually wagered on its spot):
     - If the working sequence is empty when a replayed record is reached,
       treat it as having just reset to the original `sequence` (this models
       the "reset and repeat after hitting target" behavior consistently
       during replay).
     - If that record's `netChange > 0` (win — includes a banker win net of
       commission): cross off the ends — if the sequence has 1 or 2 numbers
       left, it becomes empty; otherwise drop the first and last element.
     - If `netChange === 0` (push — a tie occurred while betting
       player/banker, stake returned): sequence is unchanged.
     - If `netChange < 0` (loss): append `wager / unit` (the units actually
       staked) to the end of the sequence.
  2. After replay, if the resulting sequence is empty (the last replayed hand
     just completed it), reset to the original `sequence`.
  3. Bet size in units = single remaining number if length 1, else
     `first + last`. Bet size in dollars = `units * unit`, clamped to
     `TABLE_MAX_BET`.
  4. Return `Bets` with that amount on `spot` and 0 elsewhere.

## Files touched

1. **`src/renderer/src/engine/strategy.ts`** — add `labouchere()` and a
   private `deriveSequence()` helper.
2. **`src/renderer/src/engine/strategy.test.ts`** — cover: win shrinks/clears
   the sequence, loss appends the staked units, push is a no-op, single-number
   bet, reset-and-repeat after completion, clamping at `TABLE_MAX_BET`, and
   the three construction-time throws (tie spot, empty sequence, non-positive
   unit, non-positive sequence entries).
3. **`src/renderer/src/components/SimulatePanel.tsx`** (+ `.css` if needed) —
   add a strategy-type selector (`Flat Bet` / `Labouchere`). Labouchere mode
   shows: spot (player/banker only), a comma-separated sequence text field
   (default `"1,2,3,4"`), and a unit input (default `5`). On Run, parse the
   sequence text into `number[]`, surfacing a parse/validation error inline
   the same way an invalid trial count does today.
4. **`SimulatePanel.test.tsx`** — cover switching strategy type and running a
   Labouchere simulation end-to-end.

## Known tradeoff

Replaying `sessionHistory` on every call is O(n) per hand, O(n²) per session.
This is consistent with the existing simplicity-over-micro-optimization style
in this codebase (e.g. `shoeHistory` is rebuilt via spread each hand) and is
the correct tradeoff for a strategy that must stay stateless across reused
trials. If this becomes a real bottleneck for very large simulations, it can
be revisited later (e.g. by having `simulateSession` track lightweight
per-strategy state itself) — out of scope here.
