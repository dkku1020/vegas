# Simulate Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a headless "Simulate" mode that runs many hands/shoes/sessions fast without manual play, driven by a pluggable `Strategy` interface, and surface it as a new screen alongside the existing "Play" mode.

**Architecture:** A new, self-contained engine layer (`engine/strategy.ts`, `engine/rng.ts`, `engine/simulate.ts`) reuses the existing pure primitives (`createShoe`, `playHand`, `computeSettlement`, `isPastCutCard`) in a loop, independent of `gameReducer`/`GameContext`. A new `SimulatePanel` component provides a config form and results summary. `App.tsx` gets a Play/Simulate toggle. Play mode's reducer, context, and components are not modified except `App.tsx`.

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react (jsdom environment), Electron (renderer process only — no main/preload changes).

## Global Constraints

- `TABLE_MIN_BET = 5` and `TABLE_MAX_BET = 20000`, both exported from `src/renderer/src/state/gameReducer.ts` — reuse these constants, do not redefine.
- Code style: single quotes, no semicolons, 2-space indent — match the existing (committed) style in `src/renderer/src/engine/*.ts` and `src/renderer/src/state/*.ts`. Ignore the unrelated uncommitted formatting diff currently sitting in `gameReducer.ts`; do not carry double-quote/semicolon style into new files.
- Import shared types via the `@shared/types` path alias, matching existing files (e.g. `src/renderer/src/engine/rules.ts:1`).
- Tests use Vitest (`describe`/`it`/`expect` from `'vitest'`). Component tests need `// @vitest-environment jsdom` as the first line and import `render`/`screen`/`fireEvent` from `'@testing-library/react'`.
- Run `npm run typecheck` and `npm test` (i.e. `vitest run`) — both must pass before each commit.

---

### Task 1: Seeded RNG helper

**Files:**
- Create: `src/renderer/src/engine/rng.ts`
- Test: `src/renderer/src/engine/rng.test.ts`

**Interfaces:**
- Produces: `mulberry32(seed: number): () => number` — a deterministic PRNG factory compatible with the `randomFn` parameter already accepted by `createShoe` in `src/renderer/src/engine/shoe.ts:14`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/engine/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mulberry32 } from './rng'

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toBe(b())
  })

  it('produces values in the range [0, 1)', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const value = rand()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/rng.test.ts`
Expected: FAIL — `Cannot find module './rng'` (or similar resolution error), since `rng.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/engine/rng.ts`:

```ts
export function mulberry32(seed: number): () => number {
  let state = seed
  return function random(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/engine/rng.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/rng.ts src/renderer/src/engine/rng.test.ts
git commit -m "feat: add seeded PRNG for reproducible simulations"
```

---

### Task 2: Strategy interface and flat-bet strategy

**Files:**
- Create: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Consumes: `Bets`, `BetSpot`, `Outcome` from `@shared/types` (`src/shared/types.ts`).
- Produces:
  - `interface SimHandRecord { bets: Bets; outcome: Outcome; netChange: number }`
  - `interface StrategyContext { bankroll: number; shoeHistory: SimHandRecord[]; sessionHistory: SimHandRecord[] }`
  - `type Strategy = (context: StrategyContext) => Bets`
  - `function flatBet(spot: BetSpot, amount: number): Strategy`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/engine/strategy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { flatBet, type StrategyContext } from './strategy'

const emptyContext: StrategyContext = { bankroll: 1000, shoeHistory: [], sessionHistory: [] }

describe('flatBet', () => {
  it('always bets the fixed amount on the configured spot', () => {
    const strategy = flatBet('banker', 25)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 25, tie: 0 })
  })

  it('bets zero on the other two spots', () => {
    const strategy = flatBet('tie', 5)
    const bets = strategy(emptyContext)
    expect(bets.player).toBe(0)
    expect(bets.banker).toBe(0)
    expect(bets.tie).toBe(5)
  })

  it('ignores bankroll and history', () => {
    const strategy = flatBet('player', 10)
    const context: StrategyContext = {
      bankroll: 5,
      shoeHistory: [
        { bets: { player: 10, banker: 0, tie: 0 }, outcome: 'banker', netChange: -10 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 10, banker: 0, tie: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: FAIL — `Cannot find module './strategy'`

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/engine/strategy.ts`:

```ts
import type { Bets, BetSpot, Outcome } from '@shared/types'

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: add Strategy interface and flat-bet strategy"
```

---

### Task 3: Single-session simulation loop

**Files:**
- Create: `src/renderer/src/engine/simulate.ts`
- Test: `src/renderer/src/engine/simulate.test.ts`

**Interfaces:**
- Consumes:
  - `TABLE_MIN_BET`, `TABLE_MAX_BET` from `src/renderer/src/state/gameReducer.ts`
  - `createShoe(randomFn?: () => number): Shoe`, `isPastCutCard(shoe: Shoe): boolean` from `src/renderer/src/engine/shoe.ts`
  - `playHand(shoe: Shoe): PlayHandResult` (has `.shoe`, `.outcome`) from `src/renderer/src/engine/rules.ts`
  - `computeSettlement(bets: Bets, outcome: Outcome): Settlement` (has `.payouts`, `.netChange`) from `src/renderer/src/engine/payouts.ts`
  - `Strategy`, `StrategyContext`, `SimHandRecord` from `./strategy` (Task 2)
  - `Bets` from `@shared/types`
- Produces:
  - `interface SimSessionResult { finalBankroll: number; netProfit: number; busted: boolean; handsPlayed: number; shoesCompleted: number }`
  - `interface SimulateSessionConfig { strategy: Strategy; startingBankroll: number; shoesPerSession: number; randomFn: () => number }`
  - `function simulateSession(config: SimulateSessionConfig): SimSessionResult`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/engine/simulate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mulberry32 } from './rng'
import { flatBet } from './strategy'
import { simulateSession } from './simulate'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'

describe('simulateSession', () => {
  it('completes the requested number of shoes when nothing is ever wagered', () => {
    const result = simulateSession({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 2,
      randomFn: mulberry32(1)
    })
    expect(result.shoesCompleted).toBe(2)
    expect(result.busted).toBe(false)
    expect(result.netProfit).toBe(0)
    expect(result.finalBankroll).toBe(1000)
    expect(result.handsPlayed).toBeGreaterThan(0)
  })

  it('stops immediately, without playing a hand, when starting bankroll is already below the table minimum', () => {
    const result = simulateSession({
      strategy: flatBet('banker', 5),
      startingBankroll: TABLE_MIN_BET - 1,
      shoesPerSession: 1,
      randomFn: mulberry32(1)
    })
    expect(result.busted).toBe(true)
    expect(result.handsPlayed).toBe(0)
    expect(result.shoesCompleted).toBe(0)
    expect(result.finalBankroll).toBe(TABLE_MIN_BET - 1)
    expect(result.netProfit).toBe(0)
  })

  it('throws when the strategy returns a negative bet', () => {
    const strategy = () => ({ player: -5, banker: 0, tie: 0 })
    expect(() =>
      simulateSession({
        strategy,
        startingBankroll: 1000,
        shoesPerSession: 1,
        randomFn: mulberry32(1)
      })
    ).toThrow()
  })

  it('throws when the strategy returns a bet exceeding the table max for a spot', () => {
    const strategy = () => ({ player: TABLE_MAX_BET + 1, banker: 0, tie: 0 })
    expect(() =>
      simulateSession({
        strategy,
        startingBankroll: 1_000_000,
        shoesPerSession: 1,
        randomFn: mulberry32(1)
      })
    ).toThrow()
  })

  it('throws when the strategy returns a total bet exceeding the bankroll', () => {
    const strategy = () => ({ player: 200, banker: 0, tie: 0 })
    expect(() =>
      simulateSession({
        strategy,
        startingBankroll: 100,
        shoesPerSession: 1,
        randomFn: mulberry32(1)
      })
    ).toThrow()
  })

  it('plays more hands as shoesPerSession increases, given the same seed', () => {
    const baseConfig = {
      strategy: flatBet('banker', 5),
      startingBankroll: 100_000
    }
    const oneShoe = simulateSession({ ...baseConfig, shoesPerSession: 1, randomFn: mulberry32(99) })
    const twoShoes = simulateSession({ ...baseConfig, shoesPerSession: 2, randomFn: mulberry32(99) })
    expect(oneShoe.shoesCompleted).toBe(1)
    expect(twoShoes.shoesCompleted).toBe(2)
    expect(twoShoes.handsPlayed).toBeGreaterThan(oneShoe.handsPlayed)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/simulate.test.ts`
Expected: FAIL — `Cannot find module './simulate'`

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/engine/simulate.ts`:

```ts
import type { Bets } from '@shared/types'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'
import { createShoe, isPastCutCard, type Shoe } from './shoe'
import { playHand } from './rules'
import { computeSettlement } from './payouts'
import type { Strategy, StrategyContext, SimHandRecord } from './strategy'

export interface SimSessionResult {
  finalBankroll: number
  netProfit: number
  busted: boolean
  handsPlayed: number
  shoesCompleted: number
}

export interface SimulateSessionConfig {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  randomFn: () => number
}

function validateBets(bets: Bets, bankroll: number): void {
  for (const amount of [bets.player, bets.banker, bets.tie]) {
    if (amount < 0) {
      throw new Error(`Strategy returned a negative bet: ${amount}`)
    }
    if (amount > TABLE_MAX_BET) {
      throw new Error(
        `Strategy returned a bet of ${amount}, exceeding the table max of ${TABLE_MAX_BET}`
      )
    }
  }
  const total = bets.player + bets.banker + bets.tie
  if (total > bankroll) {
    throw new Error(
      `Strategy returned a total bet of ${total}, exceeding the bankroll of ${bankroll}`
    )
  }
}

export function simulateSession(config: SimulateSessionConfig): SimSessionResult {
  const { strategy, startingBankroll, shoesPerSession, randomFn } = config

  let bankroll = startingBankroll
  let shoe: Shoe = createShoe(randomFn)
  let shoeHistory: SimHandRecord[] = []
  const sessionHistory: SimHandRecord[] = []
  let shoesCompleted = 0
  let busted = false

  while (shoesCompleted < shoesPerSession) {
    if (bankroll < TABLE_MIN_BET) {
      busted = true
      break
    }

    const context: StrategyContext = { bankroll, shoeHistory, sessionHistory }
    const bets = strategy(context)
    validateBets(bets, bankroll)

    bankroll -= bets.player + bets.banker + bets.tie

    const result = playHand(shoe)
    shoe = result.shoe
    const settlement = computeSettlement(bets, result.outcome)
    bankroll += settlement.payouts.player + settlement.payouts.banker + settlement.payouts.tie

    const record: SimHandRecord = { bets, outcome: result.outcome, netChange: settlement.netChange }
    shoeHistory = [...shoeHistory, record]
    sessionHistory.push(record)

    if (isPastCutCard(shoe)) {
      shoe = createShoe(randomFn)
      shoeHistory = []
      shoesCompleted += 1
    }
  }

  return {
    finalBankroll: bankroll,
    netProfit: bankroll - startingBankroll,
    busted,
    handsPlayed: sessionHistory.length,
    shoesCompleted
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/engine/simulate.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/simulate.ts src/renderer/src/engine/simulate.test.ts
git commit -m "feat: add simulateSession for headless single-session simulation"
```

---

### Task 4: Multi-trial aggregation

**Files:**
- Modify: `src/renderer/src/engine/simulate.ts` (append to the file created in Task 3)
- Modify: `src/renderer/src/engine/simulate.test.ts` (append tests)

**Interfaces:**
- Consumes: `mulberry32` from `./rng` (Task 1); `simulateSession`, `SimSessionResult`, `SimulateSessionConfig` from Task 3 (same file).
- Produces:
  - `interface SimulationSummary { trialCount: number; avgNetProfit: number; medianNetProfit: number; bustRate: number; bestNetProfit: number; worstNetProfit: number; avgHandsPlayed: number }`
  - `interface SimulationResult { trials: SimSessionResult[]; summary: SimulationSummary }`
  - `interface RunSimulationConfig { strategy: Strategy; startingBankroll: number; shoesPerSession: number; trials: number; seed?: number }`
  - `function runSimulation(config: RunSimulationConfig): SimulationResult`

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/engine/simulate.test.ts`, change the existing import line:

```ts
import { simulateSession } from './simulate'
```

to:

```ts
import { simulateSession, runSimulation } from './simulate'
```

Then append this new `describe` block to the end of the file:

```ts
describe('runSimulation', () => {
  it('runs the requested number of trials', () => {
    const result = runSimulation({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 5,
      seed: 1
    })
    expect(result.trials).toHaveLength(5)
    expect(result.summary.trialCount).toBe(5)
  })

  it('produces identical results for the same seed', () => {
    const config = {
      strategy: flatBet('banker', 10),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 3,
      seed: 123
    }
    const a = runSimulation(config)
    const b = runSimulation(config)
    expect(a).toEqual(b)
  })

  it('produces different results for different seeds', () => {
    const base = {
      strategy: flatBet('banker', 10),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 3
    }
    const a = runSimulation({ ...base, seed: 1 })
    const b = runSimulation({ ...base, seed: 2 })
    expect(a.trials).not.toEqual(b.trials)
  })

  it('computes a bust rate of 1 when every trial starts below the table minimum', () => {
    const result = runSimulation({
      strategy: flatBet('banker', 5),
      startingBankroll: TABLE_MIN_BET - 1,
      shoesPerSession: 1,
      trials: 4,
      seed: 1
    })
    expect(result.summary.bustRate).toBe(1)
  })

  it('computes zeroed profit stats when nothing is ever wagered', () => {
    const result = runSimulation({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 4,
      seed: 1
    })
    expect(result.summary.avgNetProfit).toBe(0)
    expect(result.summary.medianNetProfit).toBe(0)
    expect(result.summary.bestNetProfit).toBe(0)
    expect(result.summary.worstNetProfit).toBe(0)
    expect(result.summary.bustRate).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/simulate.test.ts`
Expected: FAIL — `runSimulation` is not exported from `'./simulate'`

- [ ] **Step 3: Write the implementation**

At the top of `src/renderer/src/engine/simulate.ts`, add a new import line (the existing `import type { Strategy, StrategyContext, SimHandRecord } from './strategy'` line from Task 3 already covers `Strategy`, so it needs no change):

```ts
import { mulberry32 } from './rng'
```

Then append the following to the end of the file:

```ts
export interface SimulationSummary {
  trialCount: number
  avgNetProfit: number
  medianNetProfit: number
  bustRate: number
  bestNetProfit: number
  worstNetProfit: number
  avgHandsPlayed: number
}

export interface SimulationResult {
  trials: SimSessionResult[]
  summary: SimulationSummary
}

export interface RunSimulationConfig {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  trials: number
  seed?: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function runSimulation(config: RunSimulationConfig): SimulationResult {
  const { strategy, startingBankroll, shoesPerSession, trials, seed } = config
  const baseSeed = seed ?? Math.floor(Math.random() * 2 ** 31)

  const trialResults: SimSessionResult[] = []
  for (let i = 0; i < trials; i++) {
    trialResults.push(
      simulateSession({
        strategy,
        startingBankroll,
        shoesPerSession,
        randomFn: mulberry32(baseSeed + i)
      })
    )
  }

  const netProfits = trialResults.map((t) => t.netProfit)
  const bustedCount = trialResults.filter((t) => t.busted).length
  const handsPlayedTotal = trialResults.reduce((sum, t) => sum + t.handsPlayed, 0)

  const summary: SimulationSummary = {
    trialCount: trials,
    avgNetProfit: netProfits.reduce((a, b) => a + b, 0) / trials,
    medianNetProfit: median(netProfits),
    bustRate: bustedCount / trials,
    bestNetProfit: Math.max(...netProfits),
    worstNetProfit: Math.min(...netProfits),
    avgHandsPlayed: handsPlayedTotal / trials
  }

  return { trials: trialResults, summary }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/engine/simulate.test.ts`
Expected: PASS (11 tests total — 6 from Task 3 + 5 from this task)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/simulate.ts src/renderer/src/engine/simulate.test.ts
git commit -m "feat: add runSimulation for multi-trial aggregate backtesting"
```

---

### Task 5: SimulatePanel UI

**Files:**
- Create: `src/renderer/src/components/SimulatePanel.tsx`
- Create: `src/renderer/src/components/SimulatePanel.css`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`

**Interfaces:**
- Consumes: `BetSpot` from `@shared/types`; `flatBet` from `../engine/strategy` (Task 2); `runSimulation`, `type SimulationResult` from `../engine/simulate` (Task 4).
- Produces: `SimulatePanel` component (no props), rendered with `data-testid="simulate-panel"`; results block rendered with `data-testid="simulate-results"` once a run completes.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/components/SimulatePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SimulatePanel } from './SimulatePanel'

describe('SimulatePanel', () => {
  it('renders the config form with no results until Run is clicked', () => {
    render(<SimulatePanel />)
    expect(screen.getByTestId('simulate-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })

  it('runs a simulation and displays the summary results', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
    expect(screen.getByText('Avg net profit: $0.00')).toBeInTheDocument()
    expect(screen.getByText('Bust rate: 0%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: FAIL — `Cannot find module './SimulatePanel'`

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/components/SimulatePanel.css`:

```css
.simulate-panel {
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  padding: 16px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 280px;
}

.simulate-panel__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.simulate-panel__form label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.9rem;
}

.simulate-panel__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
}
```

Create `src/renderer/src/components/SimulatePanel.tsx`:

```tsx
import { useState } from 'react'
import type { BetSpot } from '@shared/types'
import { flatBet } from '../engine/strategy'
import { runSimulation, type SimulationResult } from '../engine/simulate'
import './SimulatePanel.css'

const SPOTS: BetSpot[] = ['player', 'banker', 'tie']

export function SimulatePanel() {
  const [spot, setSpot] = useState<BetSpot>('banker')
  const [amount, setAmount] = useState('10')
  const [startingBankroll, setStartingBankroll] = useState('1000')
  const [shoesPerSession, setShoesPerSession] = useState('1')
  const [trials, setTrials] = useState('100')
  const [result, setResult] = useState<SimulationResult | null>(null)

  function handleRun(): void {
    const strategy = flatBet(spot, Number(amount))
    const next = runSimulation({
      strategy,
      startingBankroll: Number(startingBankroll),
      shoesPerSession: Number(shoesPerSession),
      trials: Number(trials)
    })
    setResult(next)
  }

  return (
    <div className="simulate-panel" data-testid="simulate-panel">
      <div className="simulate-panel__form">
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx src/renderer/src/components/SimulatePanel.css src/renderer/src/components/SimulatePanel.test.tsx
git commit -m "feat: add SimulatePanel config form and results summary"
```

---

### Task 6: Play/Simulate mode toggle in App

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`
- Modify: `src/renderer/src/App.test.tsx`

**Interfaces:**
- Consumes: `SimulatePanel` from `./components/SimulatePanel` (Task 5).
- Produces: no new exports — `App` (default export) now renders a Play/Simulate toggle and swaps between the existing play-mode content and `SimulatePanel`.

- [ ] **Step 1: Write the failing test**

In `src/renderer/src/App.test.tsx`, change the import line from:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
```

to:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
```

Then add this test inside the existing `describe('App', ...)` block (after the last existing `it`):

```tsx
  it('switches to simulate mode and back without losing the play-mode table', async () => {
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))
    expect(screen.getByTestId('simulate-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('table')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByTestId('table')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-panel')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: FAIL — no button named "Simulate" exists yet.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/renderer/src/App.tsx` with:

```tsx
import { useState } from 'react'
import { GameProvider, useGame } from './state/GameContext'
import { TitleBarOverlay } from './components/TitleBarOverlay'
import { Table } from './components/Table'
import { BigRoad } from './components/BigRoad'
import { StatsPanel } from './components/StatsPanel'
import { RebuyDialog } from './components/RebuyDialog'
import { SimulatePanel } from './components/SimulatePanel'
import { TABLE_MIN_BET } from './state/gameReducer'
import './App.css'

type AppMode = 'play' | 'simulate'

function PlayScreen() {
  const { state, dispatch } = useGame()
  const isBust = state.bankroll < TABLE_MIN_BET && state.phase === 'betting'

  return (
    <>
      <div className="app__layout">
        <div className="app__board-row">
          <BigRoad history={state.shoeHistory} />
        </div>
        <div className="app__table-row">
          <Table />
          <StatsPanel history={state.sessionHistory} />
        </div>
      </div>
      {isBust && (
        <div className="app__rebuy-overlay">
          <RebuyDialog onAddFunds={(amount) => dispatch({ type: 'ADD_FUNDS', amount })} />
        </div>
      )}
    </>
  )
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('play')

  return (
    <GameProvider>
      <div className="app">
        <TitleBarOverlay />
        <div className="app__mode-toggle">
          <button type="button" aria-pressed={mode === 'play'} onClick={() => setMode('play')}>
            Play
          </button>
          <button
            type="button"
            aria-pressed={mode === 'simulate'}
            onClick={() => setMode('simulate')}
          >
            Simulate
          </button>
        </div>
        {mode === 'play' ? <PlayScreen /> : <SimulatePanel />}
      </div>
    </GameProvider>
  )
}
```

Append to `src/renderer/src/App.css`:

```css
.app__mode-toggle {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 8px 0 0;
}

.app__mode-toggle button[aria-pressed='true'] {
  font-weight: 700;
  text-decoration: underline;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: PASS (6 tests total — 5 existing + 1 new)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: All tests pass; typecheck reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/App.test.tsx
git commit -m "feat: add Play/Simulate mode toggle to App"
```
