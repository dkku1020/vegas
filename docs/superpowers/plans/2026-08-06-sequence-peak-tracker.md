# Sequence Peak Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the highest single number the Labouchere sequence ever reached while replaying a shoe — shown as a stat + marked hand in the Analyze tab, and as an avg/max stat across trials in the Simulate tab.

**Architecture:** No changes to `labouchere()`'s betting logic. A new pure function, `computePeakSequenceNumber`, replays `deriveLabouchereSequence` (unchanged) hand-by-hand and tracks the running max. `analyze.ts` computes the same thing inline (it already replays the sequence each hand for completion detection). `simulate.ts` gains a generic, strategy-agnostic `onSessionComplete` hook so `SimulatePanel` can compute the peak per trial without the core engine knowing what "peak" means.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library (jsdom).

## Global Constraints

- The peak includes the starting sequence's own max as a baseline (the user "sees" those numbers even if nothing ever exceeds them) — never start the running peak at 0 or `-Infinity`.
- A sequence reset (back to the initial sequence after a full cycle completes) never lowers the peak and needs no special-casing — it's already captured for free by including the baseline and by never decreasing the running max.
- A zero-wager hand (Skip Bet After sit-out) cannot change the peak — this already falls out of `deriveLabouchereSequence`'s existing `wager <= 0` filter, no new code needed for that.
- Works identically for every `LabouchereSpotMode` (`player`, `banker`, `follow`, `counter`) — the peak computation only cares about wager amount and win/loss, never which side.
- The Analyze tab's "peak hand" is the index where the running peak first **strictly** increased — `null` if the peak is only ever the starting sequence's baseline. It is always a loss hand, so it can never coincide with a completion index (always a win) or a skipped index (never a wager).
- Peak values are raw sequence units, never multiplied by `unit` into a dollar figure — do not prefix them with `$`.

---

### Task 1: `computePeakSequenceNumber` in `strategy.ts`

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Produces: `computePeakSequenceNumber(initialSequence: number[], unit: number, history: SimHandRecord[]): number` — a new exported pure function. Consumed directly by `SimulatePanel.tsx` in Task 6. `analyze.ts` (Task 2) does NOT call this function — it computes the same thing inline in its own existing loop.
- Consumes: the existing exported `deriveLabouchereSequence` and `SimHandRecord` type, both already in this file.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `src/renderer/src/engine/strategy.test.ts`, after the closing `})` of the existing `describe('labouchere', ...)` block (i.e. at the end of the file):

```ts
describe('computePeakSequenceNumber', () => {
  it('returns the starting sequence max when there is no history', () => {
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, [])).toBe(4)
  })

  it('tracks a new peak after a loss appends a larger number', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
    ]
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, history)).toBe(5)
  })

  it('keeps the peak after a later win removes the number that set it', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
      { bets: { player: 30, banker: 0, tie: 0 }, outcome: 'player', netChange: 28.5 }
    ]
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, history)).toBe(5)
  })

  it('keeps tracking the peak correctly after the sequence resets to a new line', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 35, banker: 0, tie: 0 }, outcome: 'player', netChange: 33.25 },
      { bets: { player: 35, banker: 0, tie: 0 }, outcome: 'banker', netChange: -35 }
    ]
    expect(computePeakSequenceNumber([3, 4], 5, history)).toBe(7)
  })

  it('is unaffected by a zero-wager hand from a Skip Bet After sit-out', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
      { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 }
    ]
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, history)).toBe(5)
  })
})
```

Update the file's import line (currently `import { flatBet, labouchere, type StrategyContext } from './strategy'`) to also import `computePeakSequenceNumber`:

```ts
import { flatBet, labouchere, computePeakSequenceNumber, type StrategyContext } from './strategy'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: FAIL — `computePeakSequenceNumber` does not exist yet (import/reference error).

- [ ] **Step 3: Implement `computePeakSequenceNumber` in `strategy.ts`**

Add this function at the end of `src/renderer/src/engine/strategy.ts`, after the closing `}` of the `labouchere` function:

```ts
export function computePeakSequenceNumber(
  initialSequence: number[],
  unit: number,
  history: SimHandRecord[]
): number {
  let peak = Math.max(...initialSequence)
  const seen: SimHandRecord[] = []
  for (const record of history) {
    seen.push(record)
    const remaining = deriveLabouchereSequence(initialSequence, unit, seen)
    if (remaining.length > 0) {
      peak = Math.max(peak, ...remaining)
    }
  }
  return peak
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: add computePeakSequenceNumber to the strategy engine"
```

---

### Task 2: `analyzeLabouchereCompletions` peak tracking

**Files:**
- Modify: `src/renderer/src/engine/analyze.ts`
- Test: `src/renderer/src/engine/analyze.test.ts`

**Interfaces:**
- Produces: `AnalyzeLabouchereResult` widens to `{ completions: number[]; skipped: number[]; peakNumber: number; peakIndex: number | null }`. Consumed by `AnalyzePanel.tsx` in Task 4.
- Consumes: existing `labouchere`, `deriveLabouchereSequence`, `LabouchereSpotMode`, `SimHandRecord` from `./strategy`; existing `HandHistoryEntry`, `Bets` from `@shared/types`; existing `computeSettlement` from `./payouts`.

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('analyzeLabouchereCompletions', ...)` block in `src/renderer/src/engine/analyze.test.ts`, right before the closing `})` of that block:

```ts
  it('reports the starting sequence max as the peak when it is never exceeded', () => {
    const history = [entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(result.peakNumber).toBe(4)
    expect(result.peakIndex).toBeNull()
  })

  it('reports the peak number and the hand index where it was first reached', () => {
    const history = [entry('player')]
    const result = analyzeLabouchereCompletions(history, 'banker', [1, 2, 3, 4], 5)
    expect(result.peakNumber).toBe(5)
    expect(result.peakIndex).toBe(0)
  })

  it('does not move the peak index when a later sequence state does not exceed the current peak', () => {
    const history = [entry('player'), entry('banker'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'player', [1, 10], 1)
    expect(result.peakNumber).toBe(11)
    expect(result.peakIndex).toBe(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: FAIL — `result.peakNumber` and `result.peakIndex` are `undefined` because the function doesn't compute or return them yet.

- [ ] **Step 3: Implement peak tracking in `analyze.ts`**

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
  peakNumber: number
  peakIndex: number | null
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
  let peakNumber = Math.max(...initialSequence)
  let peakIndex: number | null = null

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
    } else {
      const currentMax = Math.max(...remaining)
      if (currentMax > peakNumber) {
        peakNumber = currentMax
        peakIndex = i
      }
    }
  }

  return { completions, skipped, peakNumber, peakIndex }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/analyze.ts src/renderer/src/engine/analyze.test.ts
git commit -m "feat: track the sequence peak in analyzeLabouchereCompletions"
```

---

### Task 3: `BigRoad` marks the peak hand

**Files:**
- Modify: `src/renderer/src/components/BigRoad.tsx`
- Modify: `src/renderer/src/components/BigRoad.css`
- Test: `src/renderer/src/components/BigRoad.test.tsx`

**Interfaces:**
- Produces: `BigRoad` gains an optional prop `peakIndex?: number | null` — singular (not a `Set`, unlike `highlightIndices`/`skippedIndices`), since there is at most one peak hand. Consumed by `AnalyzePanel.tsx` in Task 4.
- Consumes: existing `buildBigRoad`, `getBigRoadPositions`, `ROWS` from `../state/bigRoad`; existing `HandHistoryEntry` type; existing `highlightIndices`/`skippedIndices` props (unchanged).

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('BigRoad', ...)` block in `src/renderer/src/components/BigRoad.test.tsx`, right before the closing `})` of that block:

```ts
  it('marks the cell for a given peak index', () => {
    const { container } = render(
      <BigRoad history={[entry('player'), entry('banker')]} peakIndex={1} />
    )
    const peak = container.querySelectorAll('.big-road__cell--peak')
    expect(peak).toHaveLength(1)
    expect(peak[0].classList.contains('big-road__cell--banker')).toBe(true)
  })

  it('marks nothing when peakIndex is null or omitted', () => {
    const { container } = render(<BigRoad history={[entry('player')]} peakIndex={null} />)
    expect(container.querySelectorAll('.big-road__cell--peak')).toHaveLength(0)
  })

  it('marks the peak cell independently of highlighted and skipped cells', () => {
    const { container } = render(
      <BigRoad
        history={[entry('player'), entry('banker'), entry('player')]}
        highlightIndices={new Set([0])}
        skippedIndices={new Set([2])}
        peakIndex={1}
      />
    )
    expect(container.querySelectorAll('.big-road__cell--peak')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: FAIL — `peakIndex` is not a recognized prop yet and no `.big-road__cell--peak` class is ever rendered.

- [ ] **Step 3: Implement `peakIndex` in `BigRoad.tsx`**

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
  peakIndex?: number | null
}

export function BigRoad({ history, highlightIndices, skippedIndices, peakIndex }: BigRoadProps) {
  const grid = buildBigRoad(history)
  const columnCount = Math.max(grid.length, MIN_COLUMNS)

  const positions =
    highlightIndices || skippedIndices || peakIndex != null ? getBigRoadPositions(history) : null

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

  let peakCell: string | null = null
  if (peakIndex != null && positions) {
    const position = positions[peakIndex]
    if (position) peakCell = `${position.col}-${position.row}`
  }

  const cells = Array.from({ length: columnCount }, (_, colIndex) =>
    Array.from({ length: ROWS }, (_, rowIndex) => {
      const cell = grid[colIndex]?.[rowIndex] ?? null
      const key = `${colIndex}-${rowIndex}`
      const isHighlighted = highlightedCells.has(key)
      const isSkipped = skippedCells.has(key)
      const isPeak = key === peakCell
      const classNames = [
        'big-road__cell',
        cell ? `big-road__cell--${cell.outcome}` : '',
        isHighlighted ? 'big-road__cell--highlight' : '',
        isSkipped ? 'big-road__cell--skipped' : '',
        isPeak ? 'big-road__cell--peak' : ''
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
.big-road__cell--peak .big-road__circle {
  box-shadow: 0 0 0 2px #8e44ad;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/BigRoad.tsx src/renderer/src/components/BigRoad.css src/renderer/src/components/BigRoad.test.tsx
git commit -m "feat: mark the sequence peak hand on the Big Road chart"
```

---

### Task 4: `AnalyzePanel` peak results line + board marker

**Files:**
- Modify: `src/renderer/src/components/AnalyzePanel.tsx`
- Test: `src/renderer/src/components/AnalyzePanel.test.tsx`

**Interfaces:**
- Consumes: `analyzeLabouchereCompletions(...)` returning `{ completions, skipped, peakNumber, peakIndex }` from Task 2; `BigRoad` with `peakIndex?: number | null` from Task 3.

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('AnalyzePanel', ...)` block in `src/renderer/src/components/AnalyzePanel.test.tsx`, right before the closing `})` of that block:

```ts
  it('shows the highest sequence number reached and marks the peak hand on the board', () => {
    const history: HandHistoryEntry[] = [entry('player')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('Highest sequence number: 5')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--peak')).toHaveLength(1)
  })

  it('shows the starting sequence max as the peak with no marked hand when it is never exceeded', () => {
    const history: HandHistoryEntry[] = [entry('banker')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('Highest sequence number: 4')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--peak')).toHaveLength(0)
  })
```

(The default Spot value is already `'banker'`, so neither test needs to change it — `entry('player')` in the first test means the banker bet loses on hand 0, matching Task 2's `'reports the peak number and the hand index where it was first reached'` engine test.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: FAIL — no "Highest sequence number" text is rendered yet, and `BigRoad` never receives a `peakIndex` prop.

- [ ] **Step 3: Implement the results line and board wiring in `AnalyzePanel.tsx`**

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
  const [peakNumber, setPeakNumber] = useState(0)
  const [peakIndex, setPeakIndex] = useState<number | null>(null)
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
      setPeakNumber(result.peakNumber)
      setPeakIndex(result.peakIndex)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setCompletions(null)
      setSkipped([])
      setPeakNumber(0)
      setPeakIndex(null)
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
          <div>{skipped.filter((i) => history[i].outcome !== 'tie').length} hands skipped</div>
          <div>Highest sequence number: {peakNumber}</div>
          <BigRoad
            history={history}
            highlightIndices={new Set(completions)}
            skippedIndices={new Set(skipped)}
            peakIndex={peakIndex}
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
git commit -m "feat: show the sequence peak number and hand marker in the Analyze tab"
```

---

### Task 5: `simulateSession`/`runSimulation` gain an `onSessionComplete` hook

**Files:**
- Modify: `src/renderer/src/engine/simulate.ts`
- Test: `src/renderer/src/engine/simulate.test.ts`

**Interfaces:**
- Produces: `SimulateSessionConfig` and `RunSimulationConfig` each gain an optional field `onSessionComplete?: (sessionHistory: SimHandRecord[]) => void`. `simulateSession` invokes it once per call, right before returning, with that call's full `sessionHistory`. `runSimulation` forwards its own `onSessionComplete` unchanged to every `simulateSession` call in its trial loop. Neither `SimSessionResult` nor `SimulationResult` change shape. Consumed by `SimulatePanel.tsx` in Task 6.
- Consumes: existing `SimHandRecord` type from `./strategy` (already imported in this file).

- [ ] **Step 1: Write the failing tests**

Add `import type { SimHandRecord } from './strategy'` to the top of `src/renderer/src/engine/simulate.test.ts`, alongside the existing imports (the file currently imports `mulberry32`, `flatBet`, `simulateSession`/`runSimulation`, and the two `TABLE_*` constants — add the new type-only import as its own line).

Add these test cases: one inside the existing `describe('simulateSession', ...)` block (right before its closing `})`), and one inside the existing `describe('runSimulation', ...)` block (right before its closing `})`):

```ts
  it('calls onSessionComplete once with the full session history', () => {
    const histories: SimHandRecord[][] = []
    const result = simulateSession({
      strategy: flatBet('banker', 5),
      startingBankroll: 1000,
      shoesPerSession: 1,
      randomFn: mulberry32(1),
      onSessionComplete: (sessionHistory) => histories.push(sessionHistory)
    })
    expect(histories).toHaveLength(1)
    expect(histories[0]).toHaveLength(result.handsPlayed)
  })
```

```ts
  it('calls onSessionComplete once per trial', () => {
    let callCount = 0
    runSimulation({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 3,
      seed: 1,
      onSessionComplete: () => {
        callCount += 1
      }
    })
    expect(callCount).toBe(3)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/simulate.test.ts`
Expected: FAIL — TypeScript rejects the unknown `onSessionComplete` config field (or, if it type-checks as excess-property-permissive in this context, the callback is simply never invoked and the assertions fail).

- [ ] **Step 3: Implement the hook in `simulate.ts`**

In `src/renderer/src/engine/simulate.ts`, update the `SimulateSessionConfig` interface:

```ts
export interface SimulateSessionConfig {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  randomFn: () => number
  onSessionComplete?: (sessionHistory: SimHandRecord[]) => void
}
```

Update the start of `simulateSession` to destructure the new field, and add the call right before the `return` statement:

```ts
export function simulateSession(config: SimulateSessionConfig): SimSessionResult {
  const { strategy, startingBankroll, shoesPerSession, randomFn, onSessionComplete } = config

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
    validateBetShape(bets)

    const totalWagered = bets.player + bets.banker + bets.tie
    if (totalWagered > bankroll) {
      // The strategy's requested bet outgrew the bankroll (typical for a
      // fixed-size strategy on a losing streak) — this is a bust, not a
      // strategy bug, so the session ends here rather than throwing.
      busted = true
      break
    }
    bankroll -= totalWagered

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

  // Catches the case where the final hand of the last requested shoe drops
  // the bankroll below the table minimum on the same iteration the shoe
  // count target is reached — the loop condition exits before the top-of-loop
  // bust check runs again, so it's re-checked once more here.
  if (bankroll < TABLE_MIN_BET) {
    busted = true
  }

  onSessionComplete?.(sessionHistory)

  return {
    finalBankroll: bankroll,
    netProfit: bankroll - startingBankroll,
    busted,
    handsPlayed: sessionHistory.length,
    shoesCompleted
  }
}
```

Update `RunSimulationConfig` and `runSimulation` to forward the hook:

```ts
export interface RunSimulationConfig {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  trials: number
  seed?: number
  onSessionComplete?: (sessionHistory: SimHandRecord[]) => void
}
```

```ts
export function runSimulation(config: RunSimulationConfig): SimulationResult {
  const { strategy, startingBankroll, shoesPerSession, trials, seed, onSessionComplete } = config

  if (trials < 1) {
    throw new Error(`runSimulation requires trials >= 1, got ${trials}`)
  }

  const baseSeed = seed ?? Math.floor(Math.random() * 2 ** 31)

  const trialResults: SimSessionResult[] = []
  for (let i = 0; i < trials; i++) {
    trialResults.push(
      simulateSession({
        strategy,
        startingBankroll,
        shoesPerSession,
        randomFn: mulberry32(baseSeed + i),
        onSessionComplete
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

(Only the destructuring line, the `onSessionComplete?.(sessionHistory)` call, the two interface fields, and the `onSessionComplete` line inside the `simulateSession({...})` call are new — everything else in this file is unchanged from before.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/simulate.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/simulate.ts src/renderer/src/engine/simulate.test.ts
git commit -m "feat: add an onSessionComplete hook to simulateSession and runSimulation"
```

---

### Task 6: `SimulatePanel` peak sequence stats

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`

**Interfaces:**
- Consumes: `computePeakSequenceNumber(initialSequence, unit, history)` from Task 1; `onSessionComplete` on `RunSimulationConfig` from Task 5.

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe('SimulatePanel', ...)` block in `src/renderer/src/components/SimulatePanel.test.tsx`, right before the closing `})` of that block:

```ts
  it('hides the peak sequence stats for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.queryByText(/Avg peak sequence number/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Highest peak seen/)).not.toBeInTheDocument()
  })

  it('shows peak sequence stats for a Labouchere simulation', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByText(/Avg peak sequence number:/)).toBeInTheDocument()
    expect(screen.getByText(/Highest peak seen:/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: FAIL — neither "Avg peak sequence number" nor "Highest peak seen" is ever rendered yet, so the second test's `getByText` calls fail (the first test passes trivially since neither string is rendered for Flat Bet either — it only becomes a meaningful regression check once Task 6 Step 3 is implemented; both tests are still written up front per TDD).

- [ ] **Step 3: Implement peak stats in `SimulatePanel.tsx`**

Replace the full contents of `src/renderer/src/components/SimulatePanel.tsx` with:

```tsx
import { useState } from 'react'
import type { BetSpot } from '@shared/types'
import { flatBet, labouchere, computePeakSequenceNumber } from '../engine/strategy'
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
  const [avgPeak, setAvgPeak] = useState<number | null>(null)
  const [maxPeak, setMaxPeak] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleRun(): void {
    try {
      if (strategyType === 'flat') {
        const strategy = flatBet(spot, Number(amount))
        const next = runSimulation({
          strategy,
          startingBankroll: Number(startingBankroll),
          shoesPerSession: Number(shoesPerSession),
          trials: Number(trials)
        })
        setResult(next)
        setAvgPeak(null)
        setMaxPeak(null)
      } else {
        const parsedSequence = parseSequence(sequence)
        const parsedUnit = Number(unit)
        const strategy = labouchere(
          labouchereSpot,
          parsedSequence,
          parsedUnit,
          labouchereSpot === 'player' || labouchereSpot === 'banker'
            ? parseSkipAfter(skipAfter)
            : undefined
        )
        const peaks: number[] = []
        const next = runSimulation({
          strategy,
          startingBankroll: Number(startingBankroll),
          shoesPerSession: Number(shoesPerSession),
          trials: Number(trials),
          onSessionComplete: (sessionHistory) => {
            peaks.push(computePeakSequenceNumber(parsedSequence, parsedUnit, sessionHistory))
          }
        })
        setResult(next)
        setAvgPeak(peaks.reduce((a, b) => a + b, 0) / peaks.length)
        setMaxPeak(Math.max(...peaks))
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.')
      setResult(null)
      setAvgPeak(null)
      setMaxPeak(null)
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
          {avgPeak !== null && maxPeak !== null && (
            <>
              <div>Avg peak sequence number: {avgPeak.toFixed(1)}</div>
              <div>Highest peak seen: {maxPeak}</div>
            </>
          )}
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
git commit -m "feat: show avg/max peak sequence number in the Simulate tab"
```

---

### Task 7: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS for every test file.

- [ ] **Step 2: Run the typechecker**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no errors.

- [ ] **Step 3: Manually verify in the running app**

Run: `npm run dev`
In the app: play a few hands so the Play tab has a board, click "Analyze Big Road", pick a Labouchere spot and a sequence, click "Start Analysis", and confirm:
- A "Highest sequence number: N" line appears in the results.
- If the sequence ever grew past its starting max, a hand on the Big Road shows a distinct colored ring marking where that peak was first reached.
Then switch to the Simulate tab, select Labouchere, run a simulation, and confirm "Avg peak sequence number" and "Highest peak seen" appear in the results, and disappear again when switching the strategy back to Flat Bet.
