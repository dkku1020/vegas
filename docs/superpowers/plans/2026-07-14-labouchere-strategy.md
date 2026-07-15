# Labouchere Betting Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Labouchere betting strategy to the simulation engine, with test coverage, and expose it as a selectable strategy in the SimulatePanel UI.

**Architecture:** A new `labouchere()` factory in `strategy.ts` returns a `Strategy` function that, on every call, replays `context.sessionHistory` to deterministically reconstruct the current betting sequence (rather than mutating closure state, since `runSimulation` reuses one strategy instance across independent trials). `SimulatePanel` gets a strategy-type selector that swaps its config fields and builds either a `flatBet` or `labouchere` strategy before calling `runSimulation`.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react.

## Global Constraints

- Strategies are pure functions `(context: StrategyContext) => Bets` and must not hold mutable state in a closure — `runSimulation` reuses the same strategy instance across every independent trial.
- `TABLE_MAX_BET` is imported from `../state/gameReducer` (see `simulate.ts` for the existing precedent) — do not hardcode the table max.
- `spot === 'tie'` must be rejected by `labouchere()` at construction time (throw), since Tie pays 8:1 and isn't an even-money bet.
- On a push (tie occurs while betting player/banker; `netChange === 0`), the sequence is unchanged.
- When the sequence empties (target hit), reset to the original sequence and keep playing.
- When the computed bet would exceed `TABLE_MAX_BET`, clamp to `TABLE_MAX_BET` rather than throwing.

---

### Task 1: `labouchere` strategy in the engine

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Consumes: `Bets`, `BetSpot`, `Outcome` from `@shared/types`; `TABLE_MAX_BET` from `../state/gameReducer`; existing `SimHandRecord`, `StrategyContext`, `Strategy` types already in `strategy.ts`.
- Produces: `export function labouchere(spot: BetSpot, sequence: number[], unit: number): Strategy` — later consumed by `SimulatePanel.tsx` in Task 2.

- [ ] **Step 1: Write the failing tests**

Append this to the end of `src/renderer/src/engine/strategy.test.ts` (keep the existing `flatBet` describe block above it, and add `labouchere` to the existing import line):

```ts
import { describe, it, expect } from 'vitest'
import { flatBet, labouchere, type StrategyContext } from './strategy'
import { TABLE_MAX_BET } from '../state/gameReducer'

const emptyContext: StrategyContext = { bankroll: 1000, shoeHistory: [], sessionHistory: [] }

// ... existing describe('flatBet', ...) block stays as-is ...

describe('labouchere', () => {
  it('bets (first + last) * unit on the configured spot', () => {
    const strategy = labouchere('banker', [1, 2, 3, 4], 5)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 25, tie: 0 })
  })

  it('bets the single remaining number * unit when only one number is left', () => {
    const strategy = labouchere('player', [7], 10)
    expect(strategy(emptyContext)).toEqual({ player: 70, banker: 0, tie: 0 })
  })

  it('crosses off the first and last numbers after a win', () => {
    const strategy = labouchere('banker', [1, 2, 3, 6], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 35, tie: 0 }, outcome: 'banker', netChange: 33.25 }
      ]
    }
    expect(strategy(context).banker).toBe(25)
  })

  it('appends the staked units to the sequence after a loss', () => {
    const strategy = labouchere('banker', [1, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'player', netChange: -25 }
      ]
    }
    expect(strategy(context).banker).toBe(30)
  })

  it('leaves the sequence unchanged after a push', () => {
    const strategy = labouchere('banker', [1, 2, 3, 6], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 35, tie: 0 }, outcome: 'tie', netChange: 0 }
      ]
    }
    expect(strategy(context).banker).toBe(35)
  })

  it('resets to the initial sequence after being fully crossed off', () => {
    const strategy = labouchere('banker', [3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 35, tie: 0 }, outcome: 'banker', netChange: 33.25 }
      ]
    }
    expect(strategy(context).banker).toBe(35)
  })

  it('ignores history hands where this spot was not wagered on', () => {
    const strategy = labouchere('banker', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 10, banker: 0, tie: 0 }, outcome: 'player', netChange: 10 }
      ]
    }
    expect(strategy(context).banker).toBe(25)
  })

  it('clamps the bet to the table max', () => {
    const strategy = labouchere('banker', [TABLE_MAX_BET + 1], 1)
    expect(strategy(emptyContext).banker).toBe(TABLE_MAX_BET)
  })

  it('throws when spot is tie', () => {
    expect(() => labouchere('tie', [1, 2], 5)).toThrow()
  })

  it('throws when the sequence is empty', () => {
    expect(() => labouchere('banker', [], 5)).toThrow()
  })

  it('throws when the sequence contains a non-positive number', () => {
    expect(() => labouchere('banker', [1, 0, 2], 5)).toThrow()
  })

  it('throws when unit is not positive', () => {
    expect(() => labouchere('banker', [1, 2], 0)).toThrow()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: FAIL — `labouchere` is not exported from `./strategy`.

- [ ] **Step 3: Implement `labouchere`**

Replace the full contents of `src/renderer/src/engine/strategy.ts` with:

```ts
import type { Bets, BetSpot, Outcome } from '@shared/types'
import { TABLE_MAX_BET } from '../state/gameReducer'

export interface SimHandRecord {
  bets: Bets
  outcome: Outcome
  netChange: number
}

export interface StrategyContext {
  bankroll: number
  shoeHistory: SimHandRecord[]
  sessionHistory: SimHandRecord[]
}

export type Strategy = (context: StrategyContext) => Bets

export function flatBet(spot: BetSpot, amount: number): Strategy {
  return () => {
    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    bets[spot] = amount
    return bets
  }
}

function deriveLabouchereSequence(
  initialSequence: number[],
  unit: number,
  spot: BetSpot,
  history: SimHandRecord[]
): number[] {
  let sequence = initialSequence
  for (const record of history) {
    const wager = record.bets[spot]
    if (wager <= 0) continue
    if (sequence.length === 0) {
      sequence = initialSequence
    }
    if (record.netChange > 0) {
      sequence = sequence.length <= 2 ? [] : sequence.slice(1, -1)
    } else if (record.netChange < 0) {
      sequence = [...sequence, wager / unit]
    }
  }
  return sequence
}

export function labouchere(spot: BetSpot, sequence: number[], unit: number): Strategy {
  if (spot === 'tie') {
    throw new Error(`Labouchere requires spot to be 'player' or 'banker', got 'tie'`)
  }
  if (sequence.length === 0) {
    throw new Error('Labouchere requires a non-empty starting sequence')
  }
  if (sequence.some((n) => n <= 0)) {
    throw new Error('Labouchere sequence entries must all be positive')
  }
  if (unit <= 0) {
    throw new Error(`Labouchere requires a positive unit, got ${unit}`)
  }

  const initialSequence = [...sequence]

  return (context) => {
    let current = deriveLabouchereSequence(initialSequence, unit, spot, context.sessionHistory)
    if (current.length === 0) {
      current = initialSequence
    }

    const units = current.length === 1 ? current[0] : current[0] + current[current.length - 1]
    const betAmount = Math.min(units * unit, TABLE_MAX_BET)

    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    bets[spot] = betAmount
    return bets
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: PASS (all `flatBet` and `labouchere` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: add Labouchere betting strategy"
```

---

### Task 2: Wire Labouchere into SimulatePanel

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`

**Interfaces:**
- Consumes: `labouchere(spot: BetSpot, sequence: number[], unit: number): Strategy` from Task 1, plus existing `flatBet`, `runSimulation`.
- Produces: nothing consumed elsewhere — this is the UI leaf.

- [ ] **Step 1: Write the failing tests**

Append these three tests inside the existing `describe('SimulatePanel', ...)` block in `src/renderer/src/components/SimulatePanel.test.tsx` (after the existing three tests, before the closing `})`):

```tsx
  it('shows Labouchere fields and hides the flat Amount field when Labouchere is selected', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })

    expect(screen.getByLabelText('Sequence')).toBeInTheDocument()
    expect(screen.getByLabelText('Unit')).toBeInTheDocument()
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument()
  })

  it('runs a Labouchere simulation and displays the summary results', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('shows an error instead of crashing when the Labouchere sequence is invalid', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: FAIL — there is no element with label "Strategy" yet.

- [ ] **Step 3: Implement the SimulatePanel changes**

Replace the full contents of `src/renderer/src/components/SimulatePanel.tsx` with:

```tsx
import { useState } from 'react'
import type { BetSpot } from '@shared/types'
import { flatBet, labouchere } from '../engine/strategy'
import { runSimulation, type SimulationResult } from '../engine/simulate'
import './SimulatePanel.css'

const SPOTS: BetSpot[] = ['player', 'banker', 'tie']
const EVEN_MONEY_SPOTS: Array<'player' | 'banker'> = ['player', 'banker']

type StrategyType = 'flat' | 'labouchere'

function parseSequence(text: string): number[] {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const numbers = parts.map(Number)
  if (numbers.some((n) => !Number.isFinite(n))) {
    throw new Error(`Sequence must be a comma-separated list of numbers, got "${text}"`)
  }
  return numbers
}

export function SimulatePanel() {
  const [strategyType, setStrategyType] = useState<StrategyType>('flat')
  const [spot, setSpot] = useState<BetSpot>('banker')
  const [amount, setAmount] = useState('10')
  const [labouchereSpot, setLabouchereSpot] = useState<'player' | 'banker'>('banker')
  const [sequence, setSequence] = useState('1,2,3,4')
  const [unit, setUnit] = useState('5')
  const [startingBankroll, setStartingBankroll] = useState('1000')
  const [shoesPerSession, setShoesPerSession] = useState('1')
  const [trials, setTrials] = useState('100')
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleRun(): void {
    try {
      const strategy =
        strategyType === 'flat'
          ? flatBet(spot, Number(amount))
          : labouchere(labouchereSpot, parseSequence(sequence), Number(unit))
      const next = runSimulation({
        strategy,
        startingBankroll: Number(startingBankroll),
        shoesPerSession: Number(shoesPerSession),
        trials: Number(trials)
      })
      setResult(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.')
      setResult(null)
    }
  }

  return (
    <div className="simulate-panel" data-testid="simulate-panel">
      <div className="simulate-panel__form">
        <label>
          Strategy
          <select
            value={strategyType}
            onChange={(e) => setStrategyType(e.target.value as StrategyType)}
          >
            <option value="flat">Flat Bet</option>
            <option value="labouchere">Labouchere</option>
          </select>
        </label>
        {strategyType === 'flat' ? (
          <>
            <label>
              Spot
              <select value={spot} onChange={(e) => setSpot(e.target.value as BetSpot)}>
                {SPOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label>
              Spot
              <select
                value={labouchereSpot}
                onChange={(e) => setLabouchereSpot(e.target.value as 'player' | 'banker')}
              >
                {EVEN_MONEY_SPOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sequence
              <input type="text" value={sequence} onChange={(e) => setSequence(e.target.value)} />
            </label>
            <label>
              Unit
              <input type="number" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Starting bankroll
          <input
            type="number"
            value={startingBankroll}
            onChange={(e) => setStartingBankroll(e.target.value)}
          />
        </label>
        <label>
          Shoes per session
          <input
            type="number"
            value={shoesPerSession}
            onChange={(e) => setShoesPerSession(e.target.value)}
          />
        </label>
        <label>
          Trials
          <input type="number" value={trials} onChange={(e) => setTrials(e.target.value)} />
        </label>
        <button type="button" onClick={handleRun}>
          Run
        </button>
      </div>
      {error && (
        <div className="simulate-panel__error" data-testid="simulate-error">
          {error}
        </div>
      )}
      {result && (
        <div className="simulate-panel__results" data-testid="simulate-results">
          <div>Trials: {result.summary.trialCount}</div>
          <div>Avg net profit: ${result.summary.avgNetProfit.toFixed(2)}</div>
          <div>Median net profit: ${result.summary.medianNetProfit.toFixed(2)}</div>
          <div>Bust rate: {(result.summary.bustRate * 100).toFixed(0)}%</div>
          <div>Best trial: ${result.summary.bestNetProfit.toFixed(2)}</div>
          <div>Worst trial: ${result.summary.worstNetProfit.toFixed(2)}</div>
          <div>Avg hands played: {result.summary.avgHandsPlayed.toFixed(1)}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: PASS (all 6 tests green).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx src/renderer/src/components/SimulatePanel.test.tsx
git commit -m "feat: add Labouchere strategy option to SimulatePanel"
```
