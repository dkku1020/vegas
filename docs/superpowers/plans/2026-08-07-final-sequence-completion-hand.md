# Final Sequence Completion Hand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user which hand the final Labouchere sequence completion happened at, in both the Analyze tab (from a specific already-played shoe) and the Simulate tab (aggregated across randomized trials).

**Architecture:** `analyze.ts`'s existing `completions` array already contains this data for the Analyze tab — no engine change needed there, just a new UI line reading its last element. The Simulate tab needs a new engine helper, `computeLastCompletionIndex`, mirroring the existing `computePeakSequenceNumber`'s replay shape, wired into `SimulatePanel.tsx`'s per-trial `onSessionComplete` callback the same way peak tracking already is.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react.

## Global Constraints

- Hand numbers shown to the user are **1-based** (a 0-based array index `i` displays as `i + 1`) — this is a new convention, not used anywhere else in the UI yet.
- When there is no completion to report (empty `completions` array in Analyze; no trial completed in Simulate), nothing renders for this stat — no placeholder text, no zero.
- Trials that never complete a sequence are excluded from the Simulate tab's average/max, not treated as `0`.
- A completion can only genuinely happen on a hand that was actually wagered and won — zero-wager sit-out hands (from `skipAfter` or `noNewSequenceAfter`) must never be mistaken for a later completion. This is the same invariant already enforced in `analyze.ts`'s completion counting (`2026-08-06-sequence-safety-net-design.md`), reused here for the new engine helper.

Reference spec: `docs/superpowers/specs/2026-08-07-final-sequence-completion-hand-design.md`

---

## File Structure

- Modify `src/renderer/src/engine/strategy.ts` — new `computeLastCompletionIndex` export.
- Modify `src/renderer/src/engine/strategy.test.ts` — single completion, multiple completions (last one wins), never completes (`null`), zero-wager sit-out after a completion doesn't get mistaken for a later one.
- Modify `src/renderer/src/components/AnalyzePanel.tsx` — new results line reading the existing `completions` state.
- Modify `src/renderer/src/components/AnalyzePanel.test.tsx` — line shows the correct 1-based hand number; line absent when there are no completions.
- Modify `src/renderer/src/components/SimulatePanel.tsx` — new per-trial collection and aggregation, two new results lines.
- Modify `src/renderer/src/components/SimulatePanel.test.tsx` — lines hidden for Flat Bet; lines shown for a Labouchere run.

---

### Task 1: Engine — `computeLastCompletionIndex`

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Consumes: existing `SimHandRecord`, `deriveLabouchereSequence` — both already defined in `strategy.ts`.
- Produces: `computeLastCompletionIndex(initialSequence: number[], unit: number, history: SimHandRecord[]): number | null` — new export, consumed by Task 3 (`SimulatePanel.tsx`).

- [ ] **Step 1: Write the failing tests**

Add these tests inside a new `describe('computeLastCompletionIndex', ...)` block in `src/renderer/src/engine/strategy.test.ts`, placed after the existing `describe('computePeakSequenceNumber', ...)` block:

```ts
describe('computeLastCompletionIndex', () => {
  it('returns null when the sequence never completes', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
    ]
    expect(computeLastCompletionIndex([1, 2, 3, 4], 5, history)).toBeNull()
  })

  it('returns the index of a single completion', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 35, banker: 0, tie: 0 }, outcome: 'player', netChange: 33.25 }
    ]
    expect(computeLastCompletionIndex([3, 4], 5, history)).toBe(0)
  })

  it('returns the last index when the sequence completes and restarts multiple times', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 10, banker: 0, tie: 0 }, outcome: 'player', netChange: 9.5 },
      { bets: { player: 10, banker: 0, tie: 0 }, outcome: 'player', netChange: 9.5 }
    ]
    // [1,1] completes on hand 0 (single win, length<=2 rule), resets to a fresh [1,1] for
    // hand 1 (mid-loop reset in deriveLabouchereSequence), which also wins and completes.
    expect(computeLastCompletionIndex([1, 1], 5, history)).toBe(1)
  })

  it('ignores a zero-wager sit-out hand that follows a completion', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 35, banker: 0, tie: 0 }, outcome: 'player', netChange: 33.25 },
      { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 }
    ]
    // Hand 0 completes [3,4]. Hand 1 is a zero-wager sit-out (e.g. from skipAfter or
    // noNewSequenceAfter) — the derived sequence is still empty at hand 1, but that's not a
    // NEW completion, so the answer must stay 0, not advance to 1.
    expect(computeLastCompletionIndex([3, 4], 5, history)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: FAIL — `computeLastCompletionIndex` is not exported yet (TypeScript will reject the import; that compile-time rejection is the expected RED state for a function that doesn't exist yet).

- [ ] **Step 3: Implement**

In `src/renderer/src/engine/strategy.ts`, add this export right after `computePeakSequenceNumber` (at the end of the file):

```ts
export function computeLastCompletionIndex(
  initialSequence: number[],
  unit: number,
  history: SimHandRecord[]
): number | null {
  let lastCompletionIndex: number | null = null
  const seen: SimHandRecord[] = []
  for (let i = 0; i < history.length; i++) {
    const record = history[i]
    seen.push(record)
    const wager = record.bets.player + record.bets.banker
    if (wager <= 0) continue
    const remaining = deriveLabouchereSequence(initialSequence, unit, seen)
    if (remaining.length === 0) {
      lastCompletionIndex = i
    }
  }
  return lastCompletionIndex
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: PASS — all tests in the file, including every pre-existing test (unaffected — purely additive).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: add computeLastCompletionIndex to track when the final Labouchere sequence completed"
```

---

### Task 2: Analyze tab — show the final completion hand

**Files:**
- Modify: `src/renderer/src/components/AnalyzePanel.tsx`
- Test: `src/renderer/src/components/AnalyzePanel.test.tsx`

**Interfaces:**
- Consumes: the existing `completions: number[]` result already stored in `AnalyzePanel`'s state (from `analyzeLabouchereCompletions`, unchanged). No new engine calls, no new state.
- Produces: no new exports; a new JSX line inside the existing results block.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('AnalyzePanel', ...)` block in `src/renderer/src/components/AnalyzePanel.test.tsx` (anywhere after the existing completion-related tests near the top is fine):

```ts
  it('shows the hand number where the final sequence completed', () => {
    const history: HandHistoryEntry[] = [entry('player'), entry('banker'), entry('banker')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    // Spot defaults to 'banker'. Hand 0 (player): banker bet loses, [3,4] extends to [3,4,7].
    // Hand 1 (banker): wins, [3,4,7] reduces to [4] (not yet empty — length>2 slices both ends).
    // Hand 2 (banker): wins, [4] collapses to [] — completes at 0-based index 2 → hand 3.
    expect(screen.getByText('Final sequence completed at hand 3')).toBeInTheDocument()
  })

  it('does not show a final completion hand when the sequence never completes', () => {
    const history: HandHistoryEntry[] = [entry('player')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.queryByText(/Final sequence completed at hand/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: FAIL — the "shows the hand number" test can't find the text (line doesn't exist yet). The "does not show" test currently passes vacuously (the line already doesn't exist for any reason) — that's fine; it becomes a real regression guard once Step 3 lands.

- [ ] **Step 3: Implement**

In `src/renderer/src/components/AnalyzePanel.tsx`, add a new line inside the existing results block (currently right after the "hands skipped" line, before `Highest sequence number`):

```tsx
          <div>{skipped.filter((i) => history[i].outcome !== 'tie').length} hands skipped</div>
          {completions.length > 0 && (
            <div>Final sequence completed at hand {completions[completions.length - 1] + 1}</div>
          )}
          <div>Highest sequence number: {Number(peakNumber.toFixed(2))}</div>
```

(Only the new `{completions.length > 0 && (...)}` block is added — the surrounding two lines are shown for context and are unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: PASS — all tests in the file, including every pre-existing test (unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AnalyzePanel.tsx src/renderer/src/components/AnalyzePanel.test.tsx
git commit -m "feat: show the hand the final sequence completed at in the Analyze tab"
```

---

### Task 3: Simulate tab — aggregate the final completion hand across trials

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`

**Interfaces:**
- Consumes: `computeLastCompletionIndex` (Task 1) inside the existing `onSessionComplete` callback, alongside the existing `computePeakSequenceNumber` call.
- Produces: no new exports; two new local state variables and two new JSX lines.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/components/SimulatePanel.test.tsx`, replace the existing test `'hides the peak sequence stats for Flat Bet strategy'` (around line 134-142) with:

```ts
  it('hides the peak and final-completion stats for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.queryByText(/Avg peak sequence number/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Highest peak seen/)).not.toBeInTheDocument()
    expect(screen.queryByText(/final sequence completed at hand/i)).not.toBeInTheDocument()
  })
```

Then add a new test right after the existing `'shows peak sequence stats for a Labouchere simulation'` test:

```ts
  it('shows the final-completion hand stats for a Labouchere simulation', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    // 5 trials of a full shoe with a short [1,2] sequence completes essentially every trial —
    // same statistical-certainty pattern already relied on by the peak-stats test above.
    expect(screen.getByText(/Avg final sequence completed at hand:/)).toBeInTheDocument()
    expect(screen.getByText(/Latest final sequence completed at hand:/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: FAIL — the new "shows the final-completion hand stats" test can't find the new text (lines don't exist yet). The renamed "hides" test fails on its new third assertion for the same reason.

- [ ] **Step 3: Implement**

In `src/renderer/src/components/SimulatePanel.tsx`, update the import (currently line 3):

```ts
import {
  flatBet,
  labouchere,
  computePeakSequenceNumber,
  computeLastCompletionIndex
} from '../engine/strategy'
```

Add new state right after the existing `maxPeak` state (currently around line 65):

```ts
  const [avgFinalCompletionHand, setAvgFinalCompletionHand] = useState<number | null>(null)
  const [maxFinalCompletionHand, setMaxFinalCompletionHand] = useState<number | null>(null)
```

Update `handleRun`'s Labouchere branch. Currently:

```ts
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
```

becomes:

```ts
        const peaks: number[] = []
        const finalCompletionHands: number[] = []
        const next = runSimulation({
          strategy,
          startingBankroll: Number(startingBankroll),
          shoesPerSession: Number(shoesPerSession),
          trials: Number(trials),
          onSessionComplete: (sessionHistory) => {
            peaks.push(computePeakSequenceNumber(parsedSequence, parsedUnit, sessionHistory))
            const lastCompletionIndex = computeLastCompletionIndex(
              parsedSequence,
              parsedUnit,
              sessionHistory
            )
            if (lastCompletionIndex !== null) {
              finalCompletionHands.push(lastCompletionIndex + 1)
            }
          }
        })
        setResult(next)
        setAvgPeak(peaks.reduce((a, b) => a + b, 0) / peaks.length)
        setMaxPeak(Math.max(...peaks))
        if (finalCompletionHands.length > 0) {
          setAvgFinalCompletionHand(
            finalCompletionHands.reduce((a, b) => a + b, 0) / finalCompletionHands.length
          )
          setMaxFinalCompletionHand(Math.max(...finalCompletionHands))
        } else {
          setAvgFinalCompletionHand(null)
          setMaxFinalCompletionHand(null)
        }
```

Also reset the two new state variables to `null` in the two other places `avgPeak`/`maxPeak` are already reset — the Flat Bet branch of `handleRun` (currently `setAvgPeak(null); setMaxPeak(null)`) and the `catch` block (currently `setAvgPeak(null); setMaxPeak(null)`):

```ts
        setAvgPeak(null)
        setMaxPeak(null)
        setAvgFinalCompletionHand(null)
        setMaxFinalCompletionHand(null)
```

(This exact two-line block appears twice in the current file — once in the `if (strategyType === 'flat')` branch, once in the `catch` block. Add the same two new lines to both.)

Finally, add the two new results lines right after the existing peak-stats block (currently):

```tsx
          {avgPeak !== null && maxPeak !== null && (
            <>
              <div>Avg peak sequence number: {avgPeak.toFixed(1)}</div>
              <div>Highest peak seen: {Number(maxPeak.toFixed(2))}</div>
            </>
          )}
```

becomes:

```tsx
          {avgPeak !== null && maxPeak !== null && (
            <>
              <div>Avg peak sequence number: {avgPeak.toFixed(1)}</div>
              <div>Highest peak seen: {Number(maxPeak.toFixed(2))}</div>
            </>
          )}
          {avgFinalCompletionHand !== null && maxFinalCompletionHand !== null && (
            <>
              <div>Avg final sequence completed at hand: {avgFinalCompletionHand.toFixed(1)}</div>
              <div>Latest final sequence completed at hand: {maxFinalCompletionHand}</div>
            </>
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: PASS — all tests in the file, including every pre-existing test (unaffected).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS on every test this branch touches. Two pre-existing, unrelated failures are known to exist in this repo (`src/renderer/src/state/gameReducer.test.ts` and `src/renderer/src/components/Table.test.tsx`) — not a blocker, do not attempt to fix them.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx src/renderer/src/components/SimulatePanel.test.tsx
git commit -m "feat: aggregate the final sequence completion hand across trials in the Simulate tab"
```

---

## Self-Review Notes

- **Spec coverage:** Engine helper (Task 1) ✓; Analyze tab display (Task 2) ✓; Simulate tab aggregation (Task 3) ✓. The "no engine change needed for Analyze" and "exclude non-completing trials from avg/max, not zero" spec requirements are both directly reflected in Task 2's Step 3 (reads existing state only) and Task 3's Step 3 (`if (lastCompletionIndex !== null)` guards the push).
- **Placeholder scan:** No TBD/TODO; every step has literal code and hand-traced test math.
- **Type consistency:** `computeLastCompletionIndex(initialSequence: number[], unit: number, history: SimHandRecord[]): number | null` in Task 1 matches its one call site in Task 3 (`SimulatePanel.tsx`), including the `+ 1` conversion to 1-based happening at the call site (consistent with `AnalyzePanel.tsx`'s `completions[...] + 1` in Task 2 — both UI layers do the 0→1-based conversion themselves, the engine stays 0-based throughout, matching how `completions`/`peakIndex` already work).
