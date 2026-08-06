# Skip Bet After Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Labouchere player on a fixed `'player'`/`'banker'` spot sit out betting after N consecutive losses, resuming only once that spot wins outright — surfaced in both the Analyze and Simulate tabs.

**Architecture:** The loss-streak rule lives once, in `labouchere()` (`src/renderer/src/engine/strategy.ts`), as an optional 4th parameter. Both `analyzeLabouchereCompletions` (Analyze tab) and `SimulatePanel`'s direct `labouchere(...)` call (Simulate tab) thread a parsed `skipAfter` value through to it. `AnalyzePanel` additionally surfaces which hands were skipped by dimming them on the `BigRoad` chart.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library (jsdom).

## Global Constraints

- `skipAfter` is only valid when the Labouchere spot is a fixed `'player'` or `'banker'` — never `'follow'`/`'counter'`. Combining them is a construction-time error in `labouchere()`.
- `skipAfter`, when provided, must be a positive integer (`>= 1`); non-integers or values `<= 0` are a construction-time error.
- In the UI, a blank "Skip bet after" field means the feature is off (`skipAfter` is `undefined`) — never coerce blank to `0`.
- Ties never count toward the loss streak and never end a skip. Only an outright win on the fixed spot resumes betting.
- The loss streak is scanned over `shoeHistory` (resets on every new shoe), not `sessionHistory` — this matches how `follow`/`counter` spot resolution already works, so a new shoe always starts with a clean streak.
- A skipped (zero-wager) hand does not move the Labouchere sequence — this already falls out of `deriveLabouchereSequence`'s existing `wager <= 0` filter and needs no new code.

---

### Task 1: `labouchere()` skip-after loss streak

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Produces: `labouchere(spotMode: LabouchereSpotMode, sequence: number[], unit: number, skipAfter?: number): Strategy` — widened from the existing 3-arg signature. All existing 3-arg call sites remain valid (`skipAfter` defaults to `undefined`, meaning "off").
- Consumes: existing `BetSpot`, `SimHandRecord`, `StrategyContext`, `Bets` types already defined in this file; `TABLE_MAX_BET` from `../state/gameReducer`.

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('labouchere', ...)` block in `src/renderer/src/engine/strategy.test.ts`, right before the closing `})` of that block (after the `'throws when unit is not positive'` test):

```ts
  it('skips the bet after N consecutive losses on a fixed spot', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('keeps betting while the loss streak is below the skip-after threshold', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 3)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context).player).toBeGreaterThan(0)
  })

  it('does not count ties toward the skip-after loss streak', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('keeps sitting out through a tie while the loss streak is active', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('resumes betting the hand after the spot wins outright', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 }
      ],
      sessionHistory: []
    }
    expect(strategy(context).player).toBeGreaterThan(0)
  })

  it('resets the loss streak at the start of a new shoe', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ]
    }
    expect(strategy(context).player).toBeGreaterThan(0)
  })

  it('throws when skip-after is combined with a follow spot', () => {
    expect(() => labouchere('follow', [1, 2], 5, 2)).toThrow()
  })

  it('throws when skip-after is combined with a counter spot', () => {
    expect(() => labouchere('counter', [1, 2], 5, 2)).toThrow()
  })

  it('throws when skip-after is zero', () => {
    expect(() => labouchere('player', [1, 2], 5, 0)).toThrow()
  })

  it('throws when skip-after is negative', () => {
    expect(() => labouchere('player', [1, 2], 5, -1)).toThrow()
  })

  it('throws when skip-after is not an integer', () => {
    expect(() => labouchere('player', [1, 2], 5, 1.5)).toThrow()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: the new tests FAIL (skip-after has no effect yet, and no validation throws for the new argument).

- [ ] **Step 3: Implement skip-after in `strategy.ts`**

Add this helper function above `export function labouchere(`:

```ts
function countLossStreak(spot: BetSpot, shoeHistory: SimHandRecord[]): number {
  let streak = 0
  for (let i = shoeHistory.length - 1; i >= 0; i--) {
    const outcome = shoeHistory[i].outcome
    if (outcome === 'tie') continue
    if (outcome === spot) break
    streak += 1
  }
  return streak
}
```

Replace the `labouchere` function's signature and body with:

```ts
export function labouchere(
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number,
  skipAfter?: number
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
  if (skipAfter !== undefined) {
    if (spotMode === 'follow' || spotMode === 'counter') {
      throw new Error(
        `Skip-after is only valid for a fixed 'player' or 'banker' spot, got '${spotMode}'`
      )
    }
    if (!Number.isInteger(skipAfter) || skipAfter <= 0) {
      throw new Error(`Skip-after must be a positive integer, got ${skipAfter}`)
    }
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

    if (skipAfter !== undefined && countLossStreak(spot, context.shoeHistory) >= skipAfter) {
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
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: add skip-after loss streak to labouchere strategy"
```

---

### Task 2: `analyzeLabouchereCompletions` skip tracking

**Files:**
- Modify: `src/renderer/src/engine/analyze.ts`
- Test: `src/renderer/src/engine/analyze.test.ts`

**Interfaces:**
- Consumes: `labouchere(spotMode, sequence, unit, skipAfter?)` from Task 1; `LabouchereSpotMode`, `SimHandRecord` from `./strategy`; `HandHistoryEntry`, `Bets` from `@shared/types`; `computeSettlement` from `./payouts`.
- Produces: `analyzeLabouchereCompletions(history, spotMode, sequence, unit, skipAfter?): { completions: number[]; skipped: number[] }` — **return type changes** from `number[]` to this object. `AnalyzePanel.tsx` (Task 4) reads both fields.

- [ ] **Step 1: Update existing tests for the new return shape and write failing tests for skip tracking**

Replace the full contents of `src/renderer/src/engine/analyze.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { analyzeLabouchereCompletions } from './analyze'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('analyzeLabouchereCompletions', () => {
  it('returns no completions when the sequence never fully crosses off', () => {
    const history = [entry('player'), entry('player'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'banker', [1, 2, 3, 4], 5)
    expect(result.completions).toEqual([])
  })

  it('records the index where the sequence completes after a win', () => {
    const history = [entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(result.completions).toEqual([0])
  })

  it('records every completion when the sequence resets and completes again', () => {
    const history = [entry('banker'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [1, 1], 5)
    expect(result.completions).toEqual([0, 1])
  })

  it('lets a push (tie) pass through without advancing or breaking the sequence', () => {
    const history = [entry('tie'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(result.completions).toEqual([1])
  })

  it('tracks completions for a follow spot, skipping the first hand of the shoe', () => {
    const history = [entry('banker'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'follow', [3, 4], 5)
    expect(result.completions).toEqual([1])
  })

  it('throws when the sequence is empty, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [], 5)).toThrow()
  })

  it('throws when unit is not positive, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [1, 2], 0)).toThrow()
  })

  it('reports skipped hands when a fixed spot loss streak hits the skip-after threshold', () => {
    const history = [entry('banker'), entry('banker'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'player', [1, 2, 3, 4], 5, 2)
    expect(result.skipped).toEqual([2])
  })

  it('does not report skipped hands when skip-after is not set', () => {
    const history = [entry('banker'), entry('banker'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'player', [1, 2, 3, 4], 5)
    expect(result.skipped).toEqual([])
  })

  it('throws when skip-after is combined with a follow spot, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'follow', [1, 2], 5, 2)).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: FAIL — `result.completions` is `undefined` because the function still returns a bare array, and the two new skip-tracking tests fail outright.

- [ ] **Step 3: Implement skip tracking in `analyze.ts`**

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

export interface AnalyzeLabouchereResult {
  completions: number[]
  skipped: number[]
}

export function analyzeLabouchereCompletions(
  history: HandHistoryEntry[],
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number,
  skipAfter?: number
): AnalyzeLabouchereResult {
  const strategy = labouchere(spotMode, sequence, unit, skipAfter)
  const initialSequence = [...sequence]

  const completions: number[] = []
  const skipped: number[] = []
  const sessionHistory: SimHandRecord[] = []

  for (let i = 0; i < history.length; i++) {
    const bets: Bets = strategy({
      bankroll: Infinity,
      shoeHistory: sessionHistory,
      sessionHistory
    })

    if (
      skipAfter !== undefined &&
      (spotMode === 'player' || spotMode === 'banker') &&
      bets[spotMode] === 0
    ) {
      skipped.push(i)
    }

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

  return { completions, skipped }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/analyze.ts src/renderer/src/engine/analyze.test.ts
git commit -m "feat: track skipped hands in analyzeLabouchereCompletions"
```

---

### Task 3: `BigRoad` dims skipped hands

**Files:**
- Modify: `src/renderer/src/components/BigRoad.tsx`
- Modify: `src/renderer/src/components/BigRoad.css`
- Test: `src/renderer/src/components/BigRoad.test.tsx`

**Interfaces:**
- Produces: `BigRoad` gains an optional prop `skippedIndices?: Set<number>`, following the exact same index-to-cell mapping already used for `highlightIndices`. Consumed by `AnalyzePanel.tsx` in Task 4.
- Consumes: existing `buildBigRoad`, `getBigRoadPositions`, `ROWS` from `../state/bigRoad`; existing `HandHistoryEntry` type.

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('BigRoad', ...)` block in `src/renderer/src/components/BigRoad.test.tsx`, right before the closing `})` of that block:

```ts
  it('dims the cell for a given skipped history index', () => {
    const { container } = render(
      <BigRoad history={[entry('player'), entry('banker')]} skippedIndices={new Set([1])} />
    )
    const skipped = container.querySelectorAll('.big-road__cell--skipped')
    expect(skipped).toHaveLength(1)
    expect(skipped[0].classList.contains('big-road__cell--banker')).toBe(true)
  })

  it('dims nothing when skippedIndices is omitted', () => {
    const { container } = render(<BigRoad history={[entry('player')]} />)
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(0)
  })

  it('dims every matching index independently of highlighted cells', () => {
    const { container } = render(
      <BigRoad
        history={[entry('player'), entry('banker'), entry('player')]}
        highlightIndices={new Set([0])}
        skippedIndices={new Set([1, 2])}
      />
    )
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(2)
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: FAIL — `skippedIndices` is not a recognized prop yet and no `.big-road__cell--skipped` class is ever rendered.

- [ ] **Step 3: Implement `skippedIndices` in `BigRoad.tsx`**

Replace the full contents of `src/renderer/src/components/BigRoad.tsx` with:

```tsx
import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad, getBigRoadPositions, ROWS } from '../state/bigRoad'
import './BigRoad.css'

const MIN_COLUMNS = 40

interface BigRoadProps {
  history: HandHistoryEntry[]
  highlightIndices?: Set<number>
  skippedIndices?: Set<number>
}

export function BigRoad({ history, highlightIndices, skippedIndices }: BigRoadProps) {
  const grid = buildBigRoad(history)
  const columnCount = Math.max(grid.length, MIN_COLUMNS)

  const positions =
    highlightIndices || skippedIndices ? getBigRoadPositions(history) : null

  const highlightedCells = new Set<string>()
  if (highlightIndices && positions) {
    for (const index of highlightIndices) {
      const position = positions[index]
      if (position) highlightedCells.add(`${position.col}-${position.row}`)
    }
  }

  const skippedCells = new Set<string>()
  if (skippedIndices && positions) {
    for (const index of skippedIndices) {
      const position = positions[index]
      if (position) skippedCells.add(`${position.col}-${position.row}`)
    }
  }

  const cells = Array.from({ length: columnCount }, (_, colIndex) =>
    Array.from({ length: ROWS }, (_, rowIndex) => {
      const cell = grid[colIndex]?.[rowIndex] ?? null
      const key = `${colIndex}-${rowIndex}`
      const isHighlighted = highlightedCells.has(key)
      const isSkipped = skippedCells.has(key)
      const classNames = [
        'big-road__cell',
        cell ? `big-road__cell--${cell.outcome}` : '',
        isHighlighted ? 'big-road__cell--highlight' : '',
        isSkipped ? 'big-road__cell--skipped' : ''
      ]
        .filter(Boolean)
        .join(' ')
      return (
        <div key={key} className={classNames}>
          {cell && (
            <span className="big-road__circle">
              {cell.tieCount > 0 && (
                <>
                  <span className="big-road__tie" />
                  {cell.tieCount > 1 && (
                    <span className="big-road__tie-count">{cell.tieCount}</span>
                  )}
                </>
              )}
            </span>
          )}
        </div>
      )
    })
  ).flat()

  return (
    <div
      className="big-road"
      data-testid="big-road"
      style={{ gridTemplateColumns: `repeat(${columnCount}, 26px)` }}
    >
      {cells}
    </div>
  )
}
```

Add this rule to the end of `src/renderer/src/components/BigRoad.css`:

```css
.big-road__cell--skipped .big-road__circle {
  opacity: 0.35;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/BigRoad.tsx src/renderer/src/components/BigRoad.css src/renderer/src/components/BigRoad.test.tsx
git commit -m "feat: dim skipped hands on the Big Road chart"
```

---

### Task 4: `AnalyzePanel` skip-after field and results wiring

**Files:**
- Modify: `src/renderer/src/components/AnalyzePanel.tsx`
- Test: `src/renderer/src/components/AnalyzePanel.test.tsx`

**Interfaces:**
- Consumes: `analyzeLabouchereCompletions(history, spotMode, sequence, unit, skipAfter?): { completions: number[]; skipped: number[] }` from Task 2; `BigRoad` with `skippedIndices?: Set<number>` from Task 3.

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('AnalyzePanel', ...)` block in `src/renderer/src/components/AnalyzePanel.test.tsx`, right before the closing `})` of that block:

```ts
  it('shows the Skip bet after field for a fixed player/banker spot', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('hides the Skip bet after field for follow/counter spots', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    expect(screen.queryByLabelText('Skip bet after (losses)')).not.toBeInTheDocument()
  })

  it('runs an analysis with skip bet after and shows the skipped count with dimmed cells', () => {
    const history: HandHistoryEntry[] = [entry('banker'), entry('banker'), entry('player')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'player' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('1 hands skipped')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(1)
  })

  it('treats a blank Skip bet after as disabled', () => {
    const history: HandHistoryEntry[] = [entry('banker'), entry('banker'), entry('banker')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'player' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('0 hands skipped')).toBeInTheDocument()
  })

  it('shows an error when Skip bet after is not a positive integer', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-error')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: FAIL — the field doesn't exist yet, and `handleStartAnalysis` still calls `analyzeLabouchereCompletions` with the old 4-arg signature, so `setCompletions` receives the whole `{ completions, skipped }` object instead of a plain array (`completions.length` would be `undefined`, breaking the existing "Sequence completed N times" tests too — this is expected at this point in the task).

- [ ] **Step 3: Implement the field and results wiring in `AnalyzePanel.tsx`**

Replace the full contents of `src/renderer/src/components/AnalyzePanel.tsx` with:

```tsx
import { useState } from 'react'
import type { HandHistoryEntry } from '@shared/types'
import { analyzeLabouchereCompletions } from '../engine/analyze'
import { BigRoad } from './BigRoad'
import './AnalyzePanel.css'

const LABOUCHERE_SPOTS: Array<'player' | 'banker' | 'follow' | 'counter'> = [
  'player',
  'banker',
  'follow',
  'counter'
]

interface AnalyzePanelProps {
  history: HandHistoryEntry[] | null
}

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

function parseSkipAfter(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Skip bet after must be a positive integer, got "${text}"`)
  }
  return value
}

export function AnalyzePanel({ history }: AnalyzePanelProps) {
  const [spot, setSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>('banker')
  const [sequence, setSequence] = useState('1,2,3,4')
  const [unit, setUnit] = useState('5')
  const [skipAfter, setSkipAfter] = useState('')
  const [completions, setCompletions] = useState<number[] | null>(null)
  const [skipped, setSkipped] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!history) {
    return (
      <div className="analyze-panel" data-testid="analyze-panel">
        <div className="analyze-panel__empty" data-testid="analyze-empty">
          Send a board over from the Play tab first.
        </div>
      </div>
    )
  }

  function handleStartAnalysis(): void {
    try {
      const parsedSkipAfter =
        spot === 'player' || spot === 'banker' ? parseSkipAfter(skipAfter) : undefined
      const result = analyzeLabouchereCompletions(
        history as HandHistoryEntry[],
        spot,
        parseSequence(sequence),
        Number(unit),
        parsedSkipAfter
      )
      setCompletions(result.completions)
      setSkipped(result.skipped)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setCompletions(null)
      setSkipped([])
    }
  }

  return (
    <div className="analyze-panel" data-testid="analyze-panel">
      <div className="analyze-panel__form">
        <label>
          Strategy
          <select defaultValue="labouchere">
            <option value="labouchere">Labouchere</option>
          </select>
        </label>
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
        {(spot === 'player' || spot === 'banker') && (
          <label>
            Skip bet after (losses)
            <input
              type="text"
              value={skipAfter}
              onChange={(e) => setSkipAfter(e.target.value)}
              placeholder="e.g. 4"
            />
          </label>
        )}
        <label>
          Sequence
          <input type="text" value={sequence} onChange={(e) => setSequence(e.target.value)} />
        </label>
        <label>
          Unit
          <input type="number" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <button type="button" onClick={handleStartAnalysis}>
          Start Analysis
        </button>
      </div>
      {error && (
        <div className="analyze-panel__error" data-testid="analyze-error">
          {error}
        </div>
      )}
      {completions && (
        <div className="analyze-panel__results" data-testid="analyze-results">
          <div>Sequence completed {completions.length} times</div>
          <div>{skipped.length} hands skipped</div>
          <BigRoad
            history={history}
            highlightIndices={new Set(completions)}
            skippedIndices={new Set(skipped)}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AnalyzePanel.tsx src/renderer/src/components/AnalyzePanel.test.tsx
git commit -m "feat: add Skip bet after field to the Analyze tab"
```

---

### Task 5: `SimulatePanel` skip-after field

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`

**Interfaces:**
- Consumes: `labouchere(spotMode, sequence, unit, skipAfter?)` from Task 1.

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('SimulatePanel', ...)` block in `src/renderer/src/components/SimulatePanel.test.tsx`, right before the closing `})` of that block:

```ts
  it('shows the Skip bet after field for a fixed Labouchere player/banker spot', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('hides the Skip bet after field for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    expect(screen.queryByLabelText('Skip bet after (losses)')).not.toBeInTheDocument()
  })

  it('hides the Skip bet after field for follow/counter spots', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'counter' } })
    expect(screen.queryByLabelText('Skip bet after (losses)')).not.toBeInTheDocument()
  })

  it('runs a Labouchere simulation with skip bet after set', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('shows an error when Skip bet after is not a positive integer', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '-1' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: FAIL — the field doesn't exist yet.

- [ ] **Step 3: Implement the field in `SimulatePanel.tsx`**

Replace the full contents of `src/renderer/src/components/SimulatePanel.tsx` with:

```tsx
import { useState } from 'react'
import type { BetSpot } from '@shared/types'
import { flatBet, labouchere } from '../engine/strategy'
import { runSimulation, type SimulationResult } from '../engine/simulate'
import './SimulatePanel.css'

const SPOTS: BetSpot[] = ['player', 'banker', 'tie']
const LABOUCHERE_SPOTS: Array<'player' | 'banker' | 'follow' | 'counter'> = [
  'player',
  'banker',
  'follow',
  'counter'
]

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

function parseSkipAfter(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Skip bet after must be a positive integer, got "${text}"`)
  }
  return value
}

export function SimulatePanel() {
  const [strategyType, setStrategyType] = useState<StrategyType>('flat')
  const [spot, setSpot] = useState<BetSpot>('banker')
  const [amount, setAmount] = useState('10')
  const [labouchereSpot, setLabouchereSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>(
    'banker'
  )
  const [sequence, setSequence] = useState('1,2,3,4')
  const [unit, setUnit] = useState('5')
  const [skipAfter, setSkipAfter] = useState('')
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
          : labouchere(
              labouchereSpot,
              parseSequence(sequence),
              Number(unit),
              labouchereSpot === 'player' || labouchereSpot === 'banker'
                ? parseSkipAfter(skipAfter)
                : undefined
            )
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
            {(labouchereSpot === 'player' || labouchereSpot === 'banker') && (
              <label>
                Skip bet after (losses)
                <input
                  type="text"
                  value={skipAfter}
                  onChange={(e) => setSkipAfter(e.target.value)}
                  placeholder="e.g. 4"
                />
              </label>
            )}
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx src/renderer/src/components/SimulatePanel.test.tsx
git commit -m "feat: add Skip bet after field to the Simulate tab"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS for every test file except pre-existing, unrelated failures in `src/renderer/src/state/gameReducer.test.ts` (these come from separate uncommitted work on `gameReducer.ts` and are out of scope for this plan — if that file is clean/committed by the time this runs, all tests should pass with zero failures).

- [ ] **Step 2: Run the typechecker**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no errors.

- [ ] **Step 3: Manually verify in the running app**

Run: `npm run dev`
In the app: play a few hands so the Play tab has a board with a losing streak on one side, click "Analyze Big Road", select the Labouchere strategy's `player` or `banker` spot, set "Skip bet after" to a small number like `2`, click "Start Analysis", and confirm:
- The "Skip bet after (losses)" field is visible for `player`/`banker` and disappears when switching to `follow`/`counter`.
- The results show a "N hands skipped" line.
- Skipped hands render visibly dimmed on the Big Road chart.
Then switch to the Simulate tab, select Labouchere, set a `player`/`banker` spot with a skip-after value, and confirm the simulation runs without error.
