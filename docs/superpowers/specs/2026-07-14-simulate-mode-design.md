# Simulate Mode

## Summary

Add a "Simulate" mode alongside the existing "Play" mode. Simulate mode runs many hands (and many independent multi-shoe sessions) headlessly and fast, without requiring the user to click Deal/Next Hand each time, and reports aggregate statistics. It's built around a `Strategy` interface so future automated betting strategies (Martingale, follow-the-shoe, etc.) can plug in without changing the simulation engine.

Play mode (the existing `gameReducer` / `GameContext` / `Table` / `BigRoad` flow) is untouched. Simulate mode is a fully separate, headless engine that reuses the same low-level primitives (`createShoe`, `playHand`, `computeSettlement`, `isPastCutCard`) but drives them in a loop instead of through dispatched UI actions.

## 1. Strategy interface

`src/renderer/src/engine/strategy.ts`:

```ts
export interface SimHandRecord {
  bets: Bets // what was wagered on that hand
  outcome: Outcome
  netChange: number
}

export interface StrategyContext {
  bankroll: number
  shoeHistory: SimHandRecord[] // hands played so far in the current shoe (resets on reshuffle)
  sessionHistory: SimHandRecord[] // hands played so far in the whole session (across shoes)
}

export type Strategy = (context: StrategyContext) => Bets
```

- A strategy is a pure function: given bankroll and history (what was bet and what happened each hand — the same information a real player at the table has, not the shoe's remaining cards), it returns the `Bets` to place on the next hand.
- Returning `{ player: 0, banker: 0, tie: 0 }` skips betting on that hand (the hand still deals and is recorded, like Free Hand in play mode).
- Including `bets` (not just `outcome`) in `SimHandRecord` is what lets bet-sizing strategies (Martingale-style doubling, etc.) work later — they need to know what was wagered and whether it won, not just who won.

**Built-in strategy (only one shipped in this build):**

```ts
export function flatBet(spot: BetSpot, amount: number): Strategy
```

Always bets a fixed `amount` on a single `spot`, ignoring history. This is the default/only selectable strategy in the UI for now.

## 2. Simulation engine

`src/renderer/src/engine/simulate.ts`.

### One session (one trial)

Starting from a `startingBankroll`, play hands until either `shoesPerSession` shoes have been completed or the player busts.

Per-hand loop:
1. If `bankroll < TABLE_MIN_BET`, stop the session with `busted: true` (mirrors the existing rebuy threshold used in play mode).
2. Call the strategy with the current `StrategyContext` to get `bets`.
3. Validate: each spot amount `>= 0` and `<= TABLE_MAX_BET`, and `bets.player + bets.banker + bets.tie <= bankroll`. An invalid response **throws** — a misbehaving strategy is a programming error, not a runtime condition to clamp around silently.
4. Debit the total wager from bankroll, `playHand(shoe)`, `computeSettlement(bets, outcome)`, credit payouts back to bankroll.
5. Append a `SimHandRecord` to both `shoeHistory` and `sessionHistory`; increment `handsPlayed`.
6. If `isPastCutCard(shoe)`, reshuffle via `createShoe(randomFn)`, reset `shoeHistory` to `[]`, increment `shoesCompleted`.

```ts
export interface SimSessionResult {
  finalBankroll: number
  netProfit: number
  busted: boolean
  handsPlayed: number
  shoesCompleted: number
}

export function simulateSession(config: {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  randomFn: () => number
}): SimSessionResult
```

### Many trials

Each trial is an independent session: fresh bankroll (`startingBankroll`), fresh shoe sequence, own seeded RNG. Bankroll carries continuously across shoes *within* a trial (a real playing session that reshuffles and keeps going), but each trial starts over independently — this is what makes aggregating across trials statistically meaningful.

```ts
export interface SimulationResult {
  trials: SimSessionResult[]
  summary: {
    trialCount: number
    avgNetProfit: number
    medianNetProfit: number
    bustRate: number // fraction of trials where busted === true
    bestNetProfit: number
    worstNetProfit: number
    avgHandsPlayed: number
  }
}

export function runSimulation(config: {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  trials: number
  seed?: number
}): SimulationResult
```

Per-hand records are not retained in `SimulationResult` — only session-level aggregates (`SimSessionResult` per trial plus the computed `summary`). With thousands of trials, keeping every hand would consume memory the summary view never uses.

### Reproducibility (seeded RNG)

`createShoe` already accepts an injectable `randomFn`. Each trial gets its own deterministic PRNG (a small `mulberry32`-style generator) seeded from `config.seed + trialIndex`. If `seed` is omitted, a random base seed is generated once per run. This makes a given `runSimulation` call reproducible, which matters later for comparing two strategies against the *same* shoe sequences.

## 3. UI

### Mode toggle

`App.tsx` adds local `useState<'play' | 'simulate'>('play')` and a small toggle near the title bar. Switching modes only changes what renders — play mode's `GameContext` state is untouched while simulate mode is active and vice versa.

### SimulatePanel

New `src/renderer/src/components/SimulatePanel.tsx`:

- **Config form:**
  - Strategy: dropdown (only "Flat Bet" for now) + spot selector + amount input.
  - Starting bankroll (number input, defaults to the same `STARTING_BANKROLL` used in play mode).
  - Shoes per session (number input).
  - Trials (number input).
- **Run button:** builds the `Strategy` from the form, calls `runSimulation(...)` synchronously, stores the returned `SimulationResult` in local component state.
- **Results summary:** a stat grid (visually consistent with `StatsPanel`) showing avg/median net profit, bust rate, best/worst trial net profit, avg hands played, and trial count.

Simulation runs synchronously on the UI thread — a single hand is a handful of array operations, so even large runs (thousands of trials × dozens of shoes) should complete well under a second. If this ever becomes a real bottleneck, the engine can be moved into a Web Worker later without changing `Strategy` or the `simulate.ts` public functions.

No card rendering, Big Road, or animation in simulate mode — it's a numbers-only backtesting view, consistent with the goal of fast statistical evaluation rather than a watchable replay.

## Out of scope / non-goals

- Additional built-in strategies beyond flat-bet (Martingale, follow-the-shoe, card-counting-style, etc.) — the interface supports them, but none are implemented here.
- A watchable/animated auto-play mode (fast-forwarding through play mode's UI) — simulate mode is headless/numeric only.
- Web Worker offloading — not needed at this scale; noted as a future option if runs get large enough to matter.
- Persisting simulation results across app restarts.
- Comparing multiple strategies side-by-side in a single run/view.
- Any change to `gameReducer`, `GameContext`, or play mode's bankroll persistence.
