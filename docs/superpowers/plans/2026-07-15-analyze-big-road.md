# Analyze Big Road Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Analyze" tab that replays a snapshot of the current Play-tab big road against a chosen Labouchere config and highlights, in yellow, every board cell where the sequence fully completed.

**Architecture:** A pure replay function (`analyzeLabouchereCompletions`) reuses the existing `labouchere` strategy and `computeSettlement` to walk a frozen `HandHistoryEntry[]` snapshot and return the history indices where the sequence emptied. `bigRoad.ts` gains a parallel index→cell mapping so those indices can be turned into `{col, row}` positions. `BigRoad` gains an optional `highlightIndices` prop that paints matching cells yellow. A new `AnalyzePanel` component hosts the config form and results. `App.tsx` owns the snapshot (`analyzedHistory`) and a three-way mode toggle (Play/Simulate/Analyze).

**Tech Stack:** React + TypeScript (renderer), Vitest + Testing Library (jsdom), existing `engine/strategy.ts` / `engine/payouts.ts`.

## Global Constraints

- Bankroll/bust is out of scope for the analysis replay — it assumes an infinite bankroll and only caps individual bets at `TABLE_MAX_BET`, matching live strategy behavior (from spec: "Data flow" section).
- The Analyze tab shows a **frozen snapshot** — playing more hands on the Play tab after clicking "Analyze Big Road" does not change what's on the Analyze tab until the button is clicked again.
- Only the Labouchere strategy ships in the config form; the strategy `<select>` is structured so a second strategy is a one-line addition later, but no second option exists now.
- Every completion in a shoe is recorded and highlighted (a sequence can complete, reset, and complete again) — not just the first.
- `buildBigRoad`'s existing signature and output must not change (existing tests in `bigRoad.test.ts` depend on it).

---

### Task 1: Analysis engine — `analyzeLabouchereCompletions`

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts:26` (export `deriveLabouchereSequence`)
- Create: `src/renderer/src/engine/analyze.ts`
- Test: `src/renderer/src/engine/analyze.test.ts`

**Interfaces:**
- Consumes: `labouchere(spot, sequence, unit): Strategy` and `deriveLabouchereSequence(initialSequence: number[], unit: number, spot: BetSpot, history: SimHandRecord[]): number[]` (both from `strategy.ts`); `computeSettlement(bets: Bets, outcome: Outcome): Settlement` (from `payouts.ts`); `HandHistoryEntry` (from `@shared/types`).
- Produces: `analyzeLabouchereCompletions(history: HandHistoryEntry[], spot: 'player' | 'banker', sequence: number[], unit: number): number[]` — later tasks (`AnalyzePanel`) call this directly.

- [ ] **Step 1: Export `deriveLabouchereSequence` from `strategy.ts`**

In `src/renderer/src/engine/strategy.ts`, change line 26 from:

```ts
function deriveLabouchereSequence(
```

to:

```ts
export function deriveLabouchereSequence(
```

No other change to that file.

- [ ] **Step 2: Write the failing tests**

Create `src/renderer/src/engine/analyze.test.ts`:

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
    const completions = analyzeLabouchereCompletions(history, 'banker', [1, 2, 3, 4], 5)
    expect(completions).toEqual([])
  })

  it('records the index where the sequence completes after a win', () => {
    const history = [entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(completions).toEqual([0])
  })

  it('records every completion when the sequence resets and completes again', () => {
    const history = [entry('banker'), entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'banker', [1, 1], 5)
    expect(completions).toEqual([0, 1])
  })

  it('lets a push (tie) pass through without advancing or breaking the sequence', () => {
    const history = [entry('tie'), entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(completions).toEqual([1])
  })

  it('throws when the sequence is empty, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [], 5)).toThrow()
  })

  it('throws when unit is not positive, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [1, 2], 0)).toThrow()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: FAIL — `Cannot find module './analyze'` (the file doesn't exist yet).

- [ ] **Step 4: Implement `analyze.ts`**

Create `src/renderer/src/engine/analyze.ts`:

```ts
import type { Bets, HandHistoryEntry } from '@shared/types'
import { labouchere, deriveLabouchereSequence, type SimHandRecord } from './strategy'
import { computeSettlement } from './payouts'

export function analyzeLabouchereCompletions(
  history: HandHistoryEntry[],
  spot: 'player' | 'banker',
  sequence: number[],
  unit: number
): number[] {
  const strategy = labouchere(spot, sequence, unit)
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

    const remaining = deriveLabouchereSequence(initialSequence, unit, spot, sessionHistory)
    if (remaining.length === 0) {
      completions.push(i)
    }
  }

  return completions
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/analyze.ts src/renderer/src/engine/analyze.test.ts
git commit -m "feat: add analyzeLabouchereCompletions engine function"
```

---

### Task 2: Big road index → cell position mapping

**Files:**
- Modify: `src/renderer/src/state/bigRoad.ts`
- Test: `src/renderer/src/state/bigRoad.test.ts`

**Interfaces:**
- Consumes: nothing new (same `HandHistoryEntry[]` input as `buildBigRoad`).
- Produces: `export interface BigRoadPosition { col: number; row: number }` and `getBigRoadPositions(history: HandHistoryEntry[]): (BigRoadPosition | null)[]` — one entry per `history` index, `null` for ties. Later used by `BigRoad.tsx` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/state/bigRoad.test.ts`, the file currently starts with:

```ts
import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad } from './bigRoad'
```

Change only the third line to also import `getBigRoadPositions`:

```ts
import { buildBigRoad, getBigRoadPositions } from './bigRoad'
```

Leave the first two import lines, the `entry()` helper, and the existing `describe('buildBigRoad', ...)` block untouched. Then add this new block after the existing `describe('buildBigRoad', ...)` block:

```ts
describe('getBigRoadPositions', () => {
  it('returns an empty array for no history', () => {
    expect(getBigRoadPositions([])).toEqual([])
  })

  it('places the first outcome at column 0, row 0', () => {
    expect(getBigRoadPositions([entry('player')])).toEqual([{ col: 0, row: 0 }])
  })

  it('continues a streak down the same column', () => {
    const positions = getBigRoadPositions([entry('banker'), entry('banker'), entry('banker')])
    expect(positions).toEqual([
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: 2 }
    ])
  })

  it('starts a new column when the outcome changes', () => {
    const positions = getBigRoadPositions([entry('player'), entry('banker')])
    expect(positions).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 }
    ])
  })

  it('maps a tie to null instead of a new position, and does not break the streak', () => {
    const positions = getBigRoadPositions([entry('banker'), entry('tie'), entry('banker')])
    expect(positions).toEqual([{ col: 0, row: 0 }, null, { col: 0, row: 1 }])
  })

  it('overflows to the next column at the same row after 6 in a streak (dragon tail)', () => {
    const history = Array.from({ length: 7 }, () => entry('banker'))
    const positions = getBigRoadPositions(history)
    expect(positions).toEqual([
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: 2 },
      { col: 0, row: 3 },
      { col: 0, row: 4 },
      { col: 0, row: 5 },
      { col: 1, row: 5 }
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/state/bigRoad.test.ts`
Expected: FAIL — `getBigRoadPositions is not exported`

- [ ] **Step 3: Refactor `bigRoad.ts` to compute both grid and positions**

Replace the full contents of `src/renderer/src/state/bigRoad.ts` with:

```ts
import type { HandHistoryEntry } from '@shared/types'

export interface BigRoadCell {
  outcome: 'player' | 'banker'
  tieCount: number
}

export interface BigRoadPosition {
  col: number
  row: number
}

export const ROWS = 6

interface BigRoadComputation {
  grid: (BigRoadCell | null)[][]
  positions: (BigRoadPosition | null)[]
}

function computeBigRoad(history: HandHistoryEntry[]): BigRoadComputation {
  const grid: (BigRoadCell | null)[][] = []
  const positions: (BigRoadPosition | null)[] = []
  let col = -1
  let row = 0
  let lastOutcome: 'player' | 'banker' | null = null

  const ensureColumn = (c: number): void => {
    while (grid.length <= c) grid.push(new Array(ROWS).fill(null))
  }

  for (const entryItem of history) {
    if (entryItem.outcome === 'tie') {
      if (col >= 0) {
        const cell = grid[col][row]
        if (cell) cell.tieCount += 1
      }
      positions.push(null)
      continue
    }

    const outcome = entryItem.outcome

    if (lastOutcome === null) {
      col = 0
      row = 0
      ensureColumn(col)
    } else if (outcome === lastOutcome) {
      if (row + 1 < ROWS) {
        row += 1
      } else {
        col += 1
        ensureColumn(col)
      }
    } else {
      col += 1
      row = 0
      ensureColumn(col)
    }

    grid[col][row] = { outcome, tieCount: 0 }
    lastOutcome = outcome
    positions.push({ col, row })
  }

  return { grid, positions }
}

export function buildBigRoad(history: HandHistoryEntry[]): (BigRoadCell | null)[][] {
  return computeBigRoad(history).grid
}

export function getBigRoadPositions(history: HandHistoryEntry[]): (BigRoadPosition | null)[] {
  return computeBigRoad(history).positions
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/state/bigRoad.test.ts`
Expected: PASS (all `buildBigRoad` tests still pass unchanged, plus 6 new `getBigRoadPositions` tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/state/bigRoad.ts src/renderer/src/state/bigRoad.test.ts
git commit -m "feat: add getBigRoadPositions for history-index-to-cell lookup"
```

---

### Task 3: `BigRoad` highlight support

**Files:**
- Modify: `src/renderer/src/components/BigRoad.tsx`
- Modify: `src/renderer/src/components/BigRoad.css`
- Test: `src/renderer/src/components/BigRoad.test.tsx`

**Interfaces:**
- Consumes: `getBigRoadPositions(history)` from `../state/bigRoad` (Task 2).
- Produces: `BigRoad` accepts an optional `highlightIndices?: Set<number>` prop; matching cells get class `big-road__cell--highlight`. Later used by `AnalyzePanel` (Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/src/components/BigRoad.test.tsx`, inside the existing `describe('BigRoad', ...)` block (after the last existing `it`):

```ts
  it('highlights the cell for a given history index', () => {
    const { container } = render(
      <BigRoad history={[entry('player'), entry('banker')]} highlightIndices={new Set([1])} />
    )
    const highlighted = container.querySelectorAll('.big-road__cell--highlight')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].classList.contains('big-road__cell--banker')).toBe(true)
  })

  it('highlights nothing when highlightIndices is omitted', () => {
    const { container } = render(<BigRoad history={[entry('player')]} />)
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(0)
  })

  it('highlights every matching index, including across multiple columns', () => {
    const { container } = render(
      <BigRoad
        history={[entry('player'), entry('banker'), entry('player')]}
        highlightIndices={new Set([0, 2])}
      />
    )
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(2)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: FAIL — highlighted cell count is 0 (prop not implemented yet)

- [ ] **Step 3: Implement the `highlightIndices` prop**

Replace the full contents of `src/renderer/src/components/BigRoad.tsx` with:

```tsx
import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad, getBigRoadPositions, ROWS } from '../state/bigRoad'
import './BigRoad.css'

const MIN_COLUMNS = 40

interface BigRoadProps {
  history: HandHistoryEntry[]
  highlightIndices?: Set<number>
}

export function BigRoad({ history, highlightIndices }: BigRoadProps) {
  const grid = buildBigRoad(history)
  const columnCount = Math.max(grid.length, MIN_COLUMNS)

  const highlightedCells = new Set<string>()
  if (highlightIndices) {
    const positions = getBigRoadPositions(history)
    for (const index of highlightIndices) {
      const position = positions[index]
      if (position) highlightedCells.add(`${position.col}-${position.row}`)
    }
  }

  const cells = Array.from({ length: columnCount }, (_, colIndex) =>
    Array.from({ length: ROWS }, (_, rowIndex) => {
      const cell = grid[colIndex]?.[rowIndex] ?? null
      const isHighlighted = highlightedCells.has(`${colIndex}-${rowIndex}`)
      const classNames = [
        'big-road__cell',
        cell ? `big-road__cell--${cell.outcome}` : '',
        isHighlighted ? 'big-road__cell--highlight' : ''
      ]
        .filter(Boolean)
        .join(' ')
      return (
        <div key={`${colIndex}-${rowIndex}`} className={classNames}>
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

- [ ] **Step 4: Add the highlight style**

Append to `src/renderer/src/components/BigRoad.css`:

```css
.big-road__cell--highlight {
  background: #f5e642;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: PASS (all existing tests plus the 3 new ones)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/BigRoad.tsx src/renderer/src/components/BigRoad.css src/renderer/src/components/BigRoad.test.tsx
git commit -m "feat: highlight big road cells by history index"
```

---

### Task 4: `AnalyzePanel` component

**Files:**
- Create: `src/renderer/src/components/AnalyzePanel.tsx`
- Create: `src/renderer/src/components/AnalyzePanel.css`
- Test: `src/renderer/src/components/AnalyzePanel.test.tsx`

**Interfaces:**
- Consumes: `analyzeLabouchereCompletions` (Task 1), `BigRoad` with `highlightIndices` (Task 3), `HandHistoryEntry` (`@shared/types`).
- Produces: `AnalyzePanel({ history: HandHistoryEntry[] | null })` — later mounted by `App.tsx` (Task 5). Test ids: `analyze-panel`, `analyze-empty`, `analyze-error`, `analyze-results`.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/components/AnalyzePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { HandHistoryEntry } from '@shared/types'
import { AnalyzePanel } from './AnalyzePanel'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('AnalyzePanel', () => {
  it('shows an empty state when no board has been sent yet', () => {
    render(<AnalyzePanel history={null} />)
    expect(screen.getByTestId('analyze-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })

  it('renders the config form with no results until Start Analysis is clicked', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    expect(screen.getByTestId('analyze-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })

  it('runs an analysis and shows the completion count with a highlighted board', () => {
    const history: HandHistoryEntry[] = [entry('banker')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-results')).toBeInTheDocument()
    expect(screen.getByText('Sequence completed 1 times')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(1)
  })

  it('shows a zero-completion result without treating it as an error', () => {
    const history: HandHistoryEntry[] = [entry('player')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('Sequence completed 0 times')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-error')).not.toBeInTheDocument()
  })

  it('shows an error message instead of crashing when the sequence is invalid', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-error')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: FAIL — `Cannot find module './AnalyzePanel'`

- [ ] **Step 3: Implement `AnalyzePanel.tsx`**

Create `src/renderer/src/components/AnalyzePanel.tsx`:

```tsx
import { useState } from 'react'
import type { HandHistoryEntry } from '@shared/types'
import { analyzeLabouchereCompletions } from '../engine/analyze'
import { BigRoad } from './BigRoad'
import './AnalyzePanel.css'

const EVEN_MONEY_SPOTS: Array<'player' | 'banker'> = ['player', 'banker']

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

export function AnalyzePanel({ history }: AnalyzePanelProps) {
  const [spot, setSpot] = useState<'player' | 'banker'>('banker')
  const [sequence, setSequence] = useState('1,2,3,4')
  const [unit, setUnit] = useState('5')
  const [completions, setCompletions] = useState<number[] | null>(null)
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
      const result = analyzeLabouchereCompletions(
        history as HandHistoryEntry[],
        spot,
        parseSequence(sequence),
        Number(unit)
      )
      setCompletions(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setCompletions(null)
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
          <select value={spot} onChange={(e) => setSpot(e.target.value as 'player' | 'banker')}>
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
          <BigRoad history={history} highlightIndices={new Set(completions)} />
        </div>
      )}
    </div>
  )
}
```

Note: `completions` is checked with `completions && (...)`, and a `0`-length array is truthy (arrays are always truthy in JS), so the zero-completions case in Step 1's tests correctly renders the results block instead of being treated as falsy/hidden.

- [ ] **Step 4: Add basic styling**

Create `src/renderer/src/components/AnalyzePanel.css`:

```css
.analyze-panel {
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  padding: 16px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.analyze-panel__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 280px;
}

.analyze-panel__form label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.9rem;
}

.analyze-panel__error {
  color: #ff8080;
  font-size: 0.9rem;
}

.analyze-panel__results {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  font-size: 0.9rem;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/AnalyzePanel.tsx src/renderer/src/components/AnalyzePanel.css src/renderer/src/components/AnalyzePanel.test.tsx
git commit -m "feat: add AnalyzePanel component"
```

---

### Task 5: Wire into `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`
- Test: `src/renderer/src/App.test.tsx`

**Interfaces:**
- Consumes: `AnalyzePanel` (Task 4), `HandHistoryEntry` (`@shared/types`), existing `useGame`, `StatsPanel`, `BigRoad`, `SimulatePanel`.
- Produces: nothing consumed further (top of the tree).

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/src/App.test.tsx`. First, add the audio stub classes used by `Table.test.tsx` (needed because this task's tests deal a real hand, which triggers `playChipSound`/`playDealSound`) — add them near the top of the file, after the existing imports:

```tsx
class FakeOscillator {
  type = 'sine'
  frequency = { value: 0 }
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  connect = vi.fn()
}

class FakeAudioContext {
  currentTime = 0
  destination = {}
  createOscillator(): FakeOscillator {
    return new FakeOscillator()
  }
  createGain(): FakeGain {
    return new FakeGain()
  }
}
```

Then add these two tests inside the existing `describe('App', ...)` block, after the last existing `it`:

```tsx
  it('shows an empty state on the Analyze tab when no board has been sent yet', async () => {
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(screen.getByTestId('analyze-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('table')).not.toBeInTheDocument()
  })

  it('sends the current board to the Analyze tab when Analyze Big Road is clicked', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    expect(screen.queryByText('Analyze Big Road')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Deal'))
    await waitFor(() => expect(screen.getByText('Analyze Big Road')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Analyze Big Road'))

    expect(screen.getByTestId('analyze-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('table')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: FAIL — no "Analyze" button, no `analyze-empty`/`analyze-panel` test ids, no "Analyze Big Road" button

- [ ] **Step 3: Implement the wiring**

Replace the full contents of `src/renderer/src/App.tsx` with:

```tsx
import { useState } from 'react'
import type { HandHistoryEntry } from '@shared/types'
import { GameProvider, useGame } from './state/GameContext'
import { TitleBarOverlay } from './components/TitleBarOverlay'
import { Table } from './components/Table'
import { BigRoad } from './components/BigRoad'
import { StatsPanel } from './components/StatsPanel'
import { RebuyDialog } from './components/RebuyDialog'
import { SimulatePanel } from './components/SimulatePanel'
import { AnalyzePanel } from './components/AnalyzePanel'
import { TABLE_MIN_BET } from './state/gameReducer'
import './App.css'

type AppMode = 'play' | 'simulate' | 'analyze'

interface PlayScreenProps {
  onAnalyze: (history: HandHistoryEntry[]) => void
}

function PlayScreen({ onAnalyze }: PlayScreenProps) {
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
          <div className="app__stats-row">
            <StatsPanel history={state.sessionHistory} />
            {state.shoeHistory.length > 0 && (
              <button type="button" onClick={() => onAnalyze(state.shoeHistory)}>
                Analyze Big Road
              </button>
            )}
          </div>
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
  const [analyzedHistory, setAnalyzedHistory] = useState<HandHistoryEntry[] | null>(null)

  function handleAnalyze(history: HandHistoryEntry[]): void {
    setAnalyzedHistory([...history])
    setMode('analyze')
  }

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
          <button
            type="button"
            aria-pressed={mode === 'analyze'}
            onClick={() => setMode('analyze')}
          >
            Analyze
          </button>
        </div>
        {mode === 'play' && <PlayScreen onAnalyze={handleAnalyze} />}
        {mode === 'simulate' && <SimulatePanel />}
        {mode === 'analyze' && <AnalyzePanel history={analyzedHistory} />}
      </div>
    </GameProvider>
  )
}
```

- [ ] **Step 4: Add layout styling for the stats row**

Append to `src/renderer/src/App.css`:

```css
.app__stats-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all test files across the project, including `analyze.test.ts`, `bigRoad.test.ts`, `BigRoad.test.tsx`, `AnalyzePanel.test.tsx`, and `App.test.tsx` from this plan.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/App.test.tsx
git commit -m "feat: add Analyze tab with big road snapshot and navigation"
```
