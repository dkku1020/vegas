# Follow / Counter Spot Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Follow" (bet the previous hand's winner) and "Counter" (bet against the previous hand's winner) as spot-selection modes for the Labouchere strategy in both the Analyze and Simulate tabs, with no bet placed until a decisive (non-tie) hand has occurred in the current shoe.

**Architecture:** Generalize the existing `labouchere()` strategy factory so spot selection is pluggable: `'player'`/`'banker'` stay fixed, while `'follow'`/`'counter'` resolve the spot per-hand by scanning `context.shoeHistory` backward for the most recent non-tie outcome. `deriveLabouchereSequence` (the win/loss sequence-progression logic) is decoupled from "which spot" entirely — it now tracks whatever side was actually wagered each hand, using `context.sessionHistory` as before. `analyzeLabouchereCompletions` and the two panel components pass the widened spot type straight through with no other logic changes.

**Tech Stack:** TypeScript, React, Vitest, `@testing-library/react`.

## Global Constraints

- No bet is placed on the first hand of a shoe (or on any leading run of ties within a shoe) for `follow`/`counter` — `shoeHistory` resets every new shoe already, in both `simulateSession` and the Analyze tab (which only ever receives one shoe's history).
- Ties are transparent to spot selection: they neither reset the "last decisive outcome" nor get bet on themselves.
- Labouchere sequence progression continues to use `context.sessionHistory` and is unaffected by shoe boundaries — unchanged from existing behavior.
- `deriveLabouchereSequence` must remain behavior-identical for existing fixed `'player'`/`'banker'` callers.

---

### Task 1: Generalize `strategy.ts` — `follow`/`counter` spot modes

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Consumes: existing `SimHandRecord`, `StrategyContext`, `Strategy`, `TABLE_MAX_BET` (all already in this file / imported).
- Produces:
  - `export type LabouchereSpotMode = BetSpot | 'follow' | 'counter'`
  - `deriveLabouchereSequence(initialSequence: number[], unit: number, history: SimHandRecord[]): number[]` (drops the old `spot: BetSpot` 3rd parameter — now derives wager as `record.bets.player + record.bets.banker`)
  - `labouchere(spotMode: LabouchereSpotMode, sequence: number[], unit: number): Strategy` (same name, widened first parameter)

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('labouchere', ...)` block in `src/renderer/src/engine/strategy.test.ts`, right after the existing `'throws when spot is tie'` test:

```ts
  it('follow bets the same side as the previous decisive winner', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 }
      ],
      sessionHistory: []
    }
    const bets = strategy(context)
    expect(bets.player).toBe(25)
    expect(bets.banker).toBe(0)
  })

  it('counter bets the opposite side of the previous decisive winner', () => {
    const strategy = labouchere('counter', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 }
      ],
      sessionHistory: []
    }
    const bets = strategy(context)
    expect(bets.player).toBe(25)
    expect(bets.banker).toBe(0)
  })

  it('places no bet on the first hand of a shoe for follow', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('places no bet on the first hand of a shoe for counter', () => {
    const strategy = labouchere('counter', [1, 2, 3, 4], 5)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('places no bet when only ties have occurred so far this shoe', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('skips a tie mid-streak and keeps following the last decisive hand', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'tie', netChange: 0 }
      ],
      sessionHistory: []
    }
    const bets = strategy(context)
    expect(bets.banker).toBe(25)
    expect(bets.player).toBe(0)
  })

  it('resets to no bet at the start of a new shoe even with prior session history', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'player', netChange: 25 }
      ]
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })
```

These use the file's existing `emptyContext` constant (`{ bankroll: 1000, shoeHistory: [], sessionHistory: [] }`, already defined at the top of `strategy.test.ts`) and the existing `StrategyContext` import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: FAIL — `vitest` transpiles TypeScript with esbuild and does not type-check, so this runs against the old `labouchere()`. Since `bets[spot] = betAmount` in the old code will happily set a stray `bets.follow` / `bets.counter` property instead of `player`/`banker` (JS doesn't stop an arbitrary string key), the assertions comparing `bets.player`/`bets.banker` or the whole object via `toEqual` will fail with wrong values / an unexpected extra property.

- [ ] **Step 3: Implement the widened `strategy.ts`**

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

export type LabouchereSpotMode = BetSpot | 'follow' | 'counter'

export function flatBet(spot: BetSpot, amount: number): Strategy {
  return () => {
    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    bets[spot] = amount
    return bets
  }
}

export function deriveLabouchereSequence(
  initialSequence: number[],
  unit: number,
  history: SimHandRecord[]
): number[] {
  let sequence = initialSequence
  for (const record of history) {
    const wager = record.bets.player + record.bets.banker
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

function resolveDynamicSpot(
  mode: 'follow' | 'counter',
  shoeHistory: SimHandRecord[]
): BetSpot | null {
  for (let i = shoeHistory.length - 1; i >= 0; i--) {
    const outcome = shoeHistory[i].outcome
    if (outcome === 'tie') continue
    return mode === 'follow' ? outcome : outcome === 'player' ? 'banker' : 'player'
  }
  return null
}

export function labouchere(
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number
): Strategy {
  if (spotMode === 'tie') {
    throw new Error(
      `Labouchere requires spot to be 'player', 'banker', 'follow', or 'counter', got 'tie'`
    )
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
    const spot =
      spotMode === 'player' || spotMode === 'banker'
        ? spotMode
        : resolveDynamicSpot(spotMode, context.shoeHistory)

    let current = deriveLabouchereSequence(initialSequence, unit, context.sessionHistory)
    if (current.length === 0) {
      current = initialSequence
    }

    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    if (spot === null) {
      return bets
    }

    const units = current.length === 1 ? current[0] : current[0] + current[current.length - 1]
    const betAmount = Math.min(units * unit, TABLE_MAX_BET)
    bets[spot] = betAmount
    return bets
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: PASS — all existing tests plus the 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: add follow/counter spot modes to labouchere strategy"
```

---

### Task 2: Widen `analyze.ts` to accept `follow`/`counter`

**Files:**
- Modify: `src/renderer/src/engine/analyze.ts`
- Test: `src/renderer/src/engine/analyze.test.ts`

**Interfaces:**
- Consumes: `labouchere`, `deriveLabouchereSequence`, `LabouchereSpotMode`, `SimHandRecord` from `./strategy` (Task 1).
- Produces: `analyzeLabouchereCompletions(history: HandHistoryEntry[], spotMode: LabouchereSpotMode, sequence: number[], unit: number): number[]` (same name, second parameter widened, same return type).

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/src/engine/analyze.test.ts`, inside the existing `describe('analyzeLabouchereCompletions', ...)` block, after the push/tie test:

```ts
  it('tracks completions for a follow spot, skipping the first hand of the shoe', () => {
    const history = [entry('banker'), entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'follow', [3, 4], 5)
    expect(completions).toEqual([1])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: FAIL — `vitest` doesn't type-check (esbuild transpile only), so this runs against the old `analyze.ts`, which still calls `deriveLabouchereSequence(initialSequence, unit, spot, sessionHistory)` with 4 arguments against Task 1's new 3-parameter signature `(initialSequence, unit, history)`. The extra argument is silently dropped positionally — `history` inside the function ends up bound to the string `'follow'` instead of the records array. The `for (const record of history)` loop then iterates over the *characters* of `'follow'`, and `record.bets.player` throws `TypeError: Cannot read properties of undefined`, failing the test.

- [ ] **Step 3: Implement the `analyze.ts` change**

Replace the full contents of `src/renderer/src/engine/analyze.ts` with:

```ts
import type { Bets, HandHistoryEntry } from '@shared/types'
import {
  labouchere,
  deriveLabouchereSequence,
  type LabouchereSpotMode,
  type SimHandRecord
} from './strategy'
import { computeSettlement } from './payouts'

export function analyzeLabouchereCompletions(
  history: HandHistoryEntry[],
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number
): number[] {
  const strategy = labouchere(spotMode, sequence, unit)
  const initialSequence = [...sequence]

  const completions: number[] = []
  const sessionHistory: SimHandRecord[] = []

  for (let i = 0; i < history.length; i++) {
    const bets: Bets = strategy({
      bankroll: Infinity,
      shoeHistory: sessionHistory,
      sessionHistory
    })
    const settlement = computeSettlement(bets, history[i].outcome)
    const record: SimHandRecord = {
      bets,
      outcome: history[i].outcome,
      netChange: settlement.netChange
    }
    sessionHistory.push(record)

    const remaining = deriveLabouchereSequence(initialSequence, unit, sessionHistory)
    if (remaining.length === 0) {
      completions.push(i)
    }
  }

  return completions
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: PASS — all existing tests plus the new follow test.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/analyze.ts src/renderer/src/engine/analyze.test.ts
git commit -m "feat: accept follow/counter spot modes in analyzeLabouchereCompletions"
```

---

### Task 3: Add Follow/Counter to the Analyze tab UI

**Files:**
- Modify: `src/renderer/src/components/AnalyzePanel.tsx`
- Test: `src/renderer/src/components/AnalyzePanel.test.tsx`

**Interfaces:**
- Consumes: `analyzeLabouchereCompletions(history, spotMode, sequence, unit)` from Task 2 (same signature, `spotMode` now accepts `'follow'`/`'counter'` too).
- Produces: no new exports — this is a leaf UI component.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/src/components/AnalyzePanel.test.tsx`, after the `'shows a zero-completion result...'` test:

```ts
  it('supports follow and counter spot options and runs an analysis with them', () => {
    const history: HandHistoryEntry[] = [entry('banker'), entry('banker')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-results')).toBeInTheDocument()
    expect(screen.getByText('Sequence completed 1 times')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: FAIL — `getByLabelText('Spot')` has no `option` with `value="follow"`, so the `fireEvent.change` either no-ops or the select stays on `'banker'`, making the completion count wrong (`Sequence completed 0 times` is rendered instead of `1 times`).

- [ ] **Step 3: Implement the `AnalyzePanel.tsx` change**

In `src/renderer/src/components/AnalyzePanel.tsx`:

Replace:
```ts
const EVEN_MONEY_SPOTS: Array<'player' | 'banker'> = ['player', 'banker']
```
with:
```ts
const LABOUCHERE_SPOTS: Array<'player' | 'banker' | 'follow' | 'counter'> = [
  'player',
  'banker',
  'follow',
  'counter'
]
```

Replace:
```ts
  const [spot, setSpot] = useState<'player' | 'banker'>('banker')
```
with:
```ts
  const [spot, setSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>('banker')
```

Replace the `Spot` `<select>` block:
```tsx
        <label>
          Spot
          <select value={spot} onChange={(e) => setSpot(e.target.value as 'player' | 'banker')}>
            {EVEN_MONEY_SPOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
```
with:
```tsx
        <label>
          Spot
          <select
            value={spot}
            onChange={(e) =>
              setSpot(e.target.value as 'player' | 'banker' | 'follow' | 'counter')
            }
          >
            {LABOUCHERE_SPOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: PASS — all existing tests plus the new follow/counter test.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AnalyzePanel.tsx src/renderer/src/components/AnalyzePanel.test.tsx
git commit -m "feat: add follow/counter spot options to the Analyze tab"
```

---

### Task 4: Add Follow/Counter to the Simulate tab UI

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`

**Interfaces:**
- Consumes: `labouchere(spotMode, sequence, unit)` from Task 1 (`spotMode` now accepts `'follow'`/`'counter'`), `runSimulation` (unchanged).
- Produces: no new exports — this is a leaf UI component.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/src/components/SimulatePanel.test.tsx`, after the `'runs a Labouchere simulation and displays the summary results'` test:

```ts
  it('runs a Labouchere simulation with a follow/counter spot option', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'counter' } })
    expect((screen.getByLabelText('Spot') as HTMLSelectElement).value).toBe('counter')
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: FAIL at the `.value).toBe('counter')` assertion — with no `<option value="counter">` in the Labouchere `Spot` select yet, setting the DOM select's value to `'counter'` leaves no option selected, so `.value` reads back as `''`, not `'counter'`.

- [ ] **Step 3: Implement the `SimulatePanel.tsx` change**

In `src/renderer/src/components/SimulatePanel.tsx`:

Replace:
```ts
const EVEN_MONEY_SPOTS: Array<'player' | 'banker'> = ['player', 'banker']
```
with:
```ts
const LABOUCHERE_SPOTS: Array<'player' | 'banker' | 'follow' | 'counter'> = [
  'player',
  'banker',
  'follow',
  'counter'
]
```

Replace:
```ts
  const [labouchereSpot, setLabouchereSpot] = useState<'player' | 'banker'>('banker')
```
with:
```ts
  const [labouchereSpot, setLabouchereSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>(
    'banker'
  )
```

Replace the Labouchere `Spot` `<select>` block:
```tsx
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
```
with:
```tsx
            <label>
              Spot
              <select
                value={labouchereSpot}
                onChange={(e) =>
                  setLabouchereSpot(e.target.value as 'player' | 'banker' | 'follow' | 'counter')
                }
              >
                {LABOUCHERE_SPOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: PASS — all existing tests plus the new follow/counter test.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file in the project, confirming no regressions across Tasks 1-4.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx src/renderer/src/components/SimulatePanel.test.tsx
git commit -m "feat: add follow/counter spot options to the Simulate tab"
```
