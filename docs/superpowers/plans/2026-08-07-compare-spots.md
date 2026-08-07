# Compare Spots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Compare Spots" action to the Simulate tab that runs the same Labouchere configuration against all four spot modes (player, banker, follow, counter) at once and shows every result side by side in a table.

**Architecture:** Pure UI-layer feature, no engine changes — `handleRun`'s existing "build strategy, run simulation, track peak/completion stats" sequence is extracted into a shared `runLabouchereSimulation` helper (Task 1, behavior-preserving refactor), then a new `handleCompareSpots` handler (Task 2) calls that helper once per spot and renders a comparison table.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react.

## Global Constraints

- Labouchere-only — the button and table are gated on `strategyType === 'labouchere'`, same visibility condition as the other Labouchere-only fields.
- Compare Spots ignores the currently-selected `labouchereSpot` dropdown value — it always runs all four spots.
- Compare Spots reuses the exact same parsing/validation functions as "Run" (`parseSequence`, `parseSkipAfter`, `parseNoNewSequenceAfter`), so an invalid field produces the same error either button would produce.
- The single-run results (`result`, `avgPeak`, etc.) and the compare-table results (`compareResults`) are independent state — running one never clears the other.
- Table formatting matches the single-run view exactly: `$X.XX` for dollar stats, `X%` for bust rate, `X.X` for one-decimal stats, plain integers for trial count and `maxPeak`/`maxFinalCompletionHand`.
- `avgPeak`/`maxPeak` are never `null` (a peak value always exists). `avgFinalCompletionHand`/`maxFinalCompletionHand` can be `null` per spot (that spot never completed a sequence across its trials) — render `—` for a `null` cell in the table, since a table row can't be conditionally hidden per-column the way the single-run view hides the whole line pair.

Reference spec: `docs/superpowers/specs/2026-08-07-compare-spots-design.md`

---

## File Structure

- Modify `src/renderer/src/components/SimulatePanel.tsx` — `LabouchereSpot` type alias, `LabouchereRunResult` interface, `runLabouchereSimulation` helper, `handleRun` refactored to use it, new `compareResults` state, `handleCompareSpots`, new button, new table.
- Modify `src/renderer/src/components/SimulatePanel.test.tsx` — refactor regression coverage (Task 1, implicit via full existing suite staying green) and new Compare Spots tests (Task 2).

---

### Task 1: Refactor — extract `runLabouchereSimulation`

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx` (no new tests — this task's job is to touch zero test-visible behavior; the existing suite is the regression check)

**Interfaces:**
- Consumes: existing `labouchere`, `runSimulation`, `computePeakSequenceNumber`, `computeLastCompletionIndex`, `SimulationResult` — all already imported in `SimulatePanel.tsx`.
- Produces: `type LabouchereSpot = 'player' | 'banker' | 'follow' | 'counter'`, `interface LabouchereRunResult { result: SimulationResult; avgPeak: number; maxPeak: number; avgFinalCompletionHand: number | null; maxFinalCompletionHand: number | null }`, and `function runLabouchereSimulation(spot: LabouchereSpot, parsedSequence: number[], parsedUnit: number, parsedSkipAfter: number | undefined, parsedNoNewSequenceAfter: number | undefined, startingBankroll: number, shoesPerSession: number, trials: number): LabouchereRunResult` — all module-level in `SimulatePanel.tsx`, consumed by Task 2's `handleCompareSpots`.

This is a **behavior-preserving refactor**: `handleRun`'s Labouchere branch must produce byte-identical results before and after. There is no new user-visible behavior to drive with a new failing test — the existing test suite is the safety net. Steps reflect that: confirm the baseline is green, make the change, confirm it's still green with zero new failures and zero changed assertions.

- [ ] **Step 1: Confirm the baseline**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: PASS — record this as the baseline (all current tests green) before touching anything.

- [ ] **Step 2: Extract the type alias, interface, and helper**

In `src/renderer/src/components/SimulatePanel.tsx`, add right after the existing `type StrategyType = 'flat' | 'labouchere'` (currently line 20):

```ts
type LabouchereSpot = 'player' | 'banker' | 'follow' | 'counter'

interface LabouchereRunResult {
  result: SimulationResult
  avgPeak: number
  maxPeak: number
  avgFinalCompletionHand: number | null
  maxFinalCompletionHand: number | null
}
```

Change the existing `LABOUCHERE_SPOTS` declaration (currently lines 13-18):

```ts
const LABOUCHERE_SPOTS: Array<'player' | 'banker' | 'follow' | 'counter'> = [
  'player',
  'banker',
  'follow',
  'counter'
]
```

to:

```ts
const LABOUCHERE_SPOTS: LabouchereSpot[] = ['player', 'banker', 'follow', 'counter']
```

(`LABOUCHERE_SPOTS` is declared above `LabouchereSpot`'s current insertion point — since `type` declarations are hoisted in TypeScript, this ordering is fine; keep `LABOUCHERE_SPOTS`'s declaration where it already is, just narrow its type annotation.)

Change the `labouchereSpot` state declaration (currently lines 58-60):

```ts
  const [labouchereSpot, setLabouchereSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>(
    'banker'
  )
```

to:

```ts
  const [labouchereSpot, setLabouchereSpot] = useState<LabouchereSpot>('banker')
```

Change the Spot `<select>`'s `onChange` cast (currently around line 179-181):

```ts
                onChange={(e) =>
                  setLabouchereSpot(e.target.value as 'player' | 'banker' | 'follow' | 'counter')
                }
```

to:

```ts
                onChange={(e) => setLabouchereSpot(e.target.value as LabouchereSpot)}
```

Now add the extracted helper function, right after `parseNoNewSequenceAfter` (currently ending around line 52), before `export function SimulatePanel()`:

```ts
function runLabouchereSimulation(
  spot: LabouchereSpot,
  parsedSequence: number[],
  parsedUnit: number,
  parsedSkipAfter: number | undefined,
  parsedNoNewSequenceAfter: number | undefined,
  startingBankroll: number,
  shoesPerSession: number,
  trials: number
): LabouchereRunResult {
  const strategy = labouchere(
    spot,
    parsedSequence,
    parsedUnit,
    parsedSkipAfter,
    parsedNoNewSequenceAfter
  )
  const peaks: number[] = []
  const finalCompletionHands: number[] = []
  const result = runSimulation({
    strategy,
    startingBankroll,
    shoesPerSession,
    trials,
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
  return {
    result,
    avgPeak: peaks.reduce((a, b) => a + b, 0) / peaks.length,
    maxPeak: Math.max(...peaks),
    avgFinalCompletionHand:
      finalCompletionHands.length > 0
        ? finalCompletionHands.reduce((a, b) => a + b, 0) / finalCompletionHands.length
        : null,
    maxFinalCompletionHand:
      finalCompletionHands.length > 0 ? Math.max(...finalCompletionHands) : null
  }
}
```

- [ ] **Step 3: Replace `handleRun`'s Labouchere branch with a call to the helper**

Replace this block (currently lines 90-131):

```ts
      } else {
        const parsedSequence = parseSequence(sequence)
        const parsedUnit = Number(unit)
        const strategy = labouchere(
          labouchereSpot,
          parsedSequence,
          parsedUnit,
          parseSkipAfter(skipAfter),
          parseNoNewSequenceAfter(noNewSequenceAfter)
        )
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
      }
```

with:

```ts
      } else {
        const parsedSequence = parseSequence(sequence)
        const parsedUnit = Number(unit)
        const runResult = runLabouchereSimulation(
          labouchereSpot,
          parsedSequence,
          parsedUnit,
          parseSkipAfter(skipAfter),
          parseNoNewSequenceAfter(noNewSequenceAfter),
          Number(startingBankroll),
          Number(shoesPerSession),
          Number(trials)
        )
        setResult(runResult.result)
        setAvgPeak(runResult.avgPeak)
        setMaxPeak(runResult.maxPeak)
        setAvgFinalCompletionHand(runResult.avgFinalCompletionHand)
        setMaxFinalCompletionHand(runResult.maxFinalCompletionHand)
      }
```

- [ ] **Step 4: Run tests to confirm zero behavior change**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: PASS — every test from Step 1's baseline still passes, same count, no new failures, no assertions needed to change. If any test's expectations had to change to pass, the refactor altered behavior — stop and reconcile before proceeding, since that would violate this task's entire premise.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx
git commit -m "refactor: extract runLabouchereSimulation helper for reuse by Compare Spots"
```

---

### Task 2: Compare Spots — new action, state, and results table

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`

**Interfaces:**
- Consumes: `runLabouchereSimulation`, `LabouchereSpot`, `LabouchereRunResult`, `LABOUCHERE_SPOTS` (all from Task 1).
- Produces: no new exports; new local state `compareResults: Record<LabouchereSpot, LabouchereRunResult> | null`, new `handleCompareSpots` function, new JSX (button + table).

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('SimulatePanel', ...)` block in `src/renderer/src/components/SimulatePanel.test.tsx` (anywhere after the existing Labouchere-related tests is fine):

```ts
  it('hides the Compare Spots button for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    expect(screen.queryByText('Compare Spots')).not.toBeInTheDocument()
  })

  it('shows the Compare Spots button for Labouchere strategy', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    expect(screen.getByText('Compare Spots')).toBeInTheDocument()
  })

  it('runs Compare Spots and shows a results table with all four spots', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Compare Spots'))

    const table = screen.getByTestId('simulate-compare-results')
    expect(table).toBeInTheDocument()
    expect(screen.getByText('player')).toBeInTheDocument()
    expect(screen.getByText('banker')).toBeInTheDocument()
    expect(screen.getByText('follow')).toBeInTheDocument()
    expect(screen.getByText('counter')).toBeInTheDocument()

    // Trial count is deterministic (always equals the requested trial count, regardless of
    // RNG), so this is a reliable assertion unlike the profit/peak numbers.
    const trialsRow = table.querySelector('[data-testid="compare-row-trials"]')
    expect(trialsRow).not.toBeNull()
    const cells = Array.from(trialsRow!.querySelectorAll('td')).slice(1)
    expect(cells.map((c) => c.textContent)).toEqual(['5', '5', '5', '5'])
  })

  it('does not clear the single-run results when Compare Spots is run, or vice versa', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })

    fireEvent.click(screen.getByText('Run'))
    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Compare Spots'))
    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByTestId('simulate-compare-results')).toBeInTheDocument()
  })

  it('shows an error when Compare Spots inputs are invalid', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Compare Spots'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-compare-results')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx`
Expected: FAIL — the "Compare Spots" button doesn't exist yet, so every new test fails on the first `getByText`/`queryByText` call.

- [ ] **Step 3: Implement**

In `src/renderer/src/components/SimulatePanel.tsx`, add new state right after the existing `maxFinalCompletionHand` state:

```ts
  const [compareResults, setCompareResults] = useState<Record<
    LabouchereSpot,
    LabouchereRunResult
  > | null>(null)
```

Add `handleCompareSpots` right after `handleRun`:

```ts
  function handleCompareSpots(): void {
    try {
      const parsedSequence = parseSequence(sequence)
      const parsedUnit = Number(unit)
      const parsedSkipAfter = parseSkipAfter(skipAfter)
      const parsedNoNewSequenceAfter = parseNoNewSequenceAfter(noNewSequenceAfter)
      const parsedStartingBankroll = Number(startingBankroll)
      const parsedShoesPerSession = Number(shoesPerSession)
      const parsedTrials = Number(trials)

      const next: Record<LabouchereSpot, LabouchereRunResult> = {
        player: runLabouchereSimulation(
          'player',
          parsedSequence,
          parsedUnit,
          parsedSkipAfter,
          parsedNoNewSequenceAfter,
          parsedStartingBankroll,
          parsedShoesPerSession,
          parsedTrials
        ),
        banker: runLabouchereSimulation(
          'banker',
          parsedSequence,
          parsedUnit,
          parsedSkipAfter,
          parsedNoNewSequenceAfter,
          parsedStartingBankroll,
          parsedShoesPerSession,
          parsedTrials
        ),
        follow: runLabouchereSimulation(
          'follow',
          parsedSequence,
          parsedUnit,
          parsedSkipAfter,
          parsedNoNewSequenceAfter,
          parsedStartingBankroll,
          parsedShoesPerSession,
          parsedTrials
        ),
        counter: runLabouchereSimulation(
          'counter',
          parsedSequence,
          parsedUnit,
          parsedSkipAfter,
          parsedNoNewSequenceAfter,
          parsedStartingBankroll,
          parsedShoesPerSession,
          parsedTrials
        )
      }
      setCompareResults(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.')
      setCompareResults(null)
    }
  }
```

Add the "Compare Spots" button *inside* the Labouchere-only JSX branch (the `else` side of the `strategyType === 'flat' ? (...) : (...)` ternary), so it only renders when `strategyType === 'labouchere'` — the existing "Run" button stays exactly where it already is, further down and outside that ternary, shared by both strategy types. Place the new button right after the closing `</label>` for "Unit" (currently the last field inside that branch, immediately before the branch's closing `</>`):

```tsx
            <label>
              Unit
              <input type="number" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <button type="button" onClick={handleCompareSpots}>
              Compare Spots
            </button>
```

Add the results table right after the existing single-run results block (after its closing `</div>`, still inside the component's return, as a sibling):

```tsx
      {compareResults && (
        <div className="simulate-panel__compare-results" data-testid="simulate-compare-results">
          <table>
            <thead>
              <tr>
                <th>Stat</th>
                {LABOUCHERE_SPOTS.map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr data-testid="compare-row-trials">
                <td>Trials</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>{compareResults[s].result.summary.trialCount}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-avg-net-profit">
                <td>Avg net profit</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>${compareResults[s].result.summary.avgNetProfit.toFixed(2)}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-median-net-profit">
                <td>Median net profit</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>${compareResults[s].result.summary.medianNetProfit.toFixed(2)}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-bust-rate">
                <td>Bust rate</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>
                    {(compareResults[s].result.summary.bustRate * 100).toFixed(0)}%
                  </td>
                ))}
              </tr>
              <tr data-testid="compare-row-best-trial">
                <td>Best trial</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>${compareResults[s].result.summary.bestNetProfit.toFixed(2)}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-worst-trial">
                <td>Worst trial</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>${compareResults[s].result.summary.worstNetProfit.toFixed(2)}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-avg-hands-played">
                <td>Avg hands played</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>{compareResults[s].result.summary.avgHandsPlayed.toFixed(1)}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-avg-peak">
                <td>Avg peak sequence number</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>{compareResults[s].avgPeak.toFixed(1)}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-max-peak">
                <td>Highest peak seen</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>{Number(compareResults[s].maxPeak.toFixed(2))}</td>
                ))}
              </tr>
              <tr data-testid="compare-row-avg-final-completion">
                <td>Avg final sequence completed at hand</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>
                    {compareResults[s].avgFinalCompletionHand !== null
                      ? compareResults[s].avgFinalCompletionHand!.toFixed(1)
                      : '—'}
                  </td>
                ))}
              </tr>
              <tr data-testid="compare-row-max-final-completion">
                <td>Latest final sequence completed at hand</td>
                {LABOUCHERE_SPOTS.map((s) => (
                  <td key={s}>{compareResults[s].maxFinalCompletionHand ?? '—'}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
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
git commit -m "feat: add Compare Spots action to run all four Labouchere spots and show results side by side"
```

---

## Self-Review Notes

- **Spec coverage:** Refactor (Task 1) ✓; new button/handler/table (Task 2) ✓; independent state for single-run vs. compare results ✓ (verified by the "does not clear" test); `—` placeholder for null completion-hand cells ✓; shared validation/error path ✓.
- **Placeholder scan:** No TBD/TODO; every step has literal code. Task 1 deliberately has no new test (documented why: behavior-preserving refactor, existing suite is the regression check) — this is a plan-level deviation from the standard "write failing test first" step, called out explicitly rather than silently omitted.
- **Type consistency:** `LabouchereSpot`, `LabouchereRunResult`, and `runLabouchereSimulation`'s signature (Task 1) match their consumption in Task 2's `handleCompareSpots` and the `compareResults` state type exactly. `LABOUCHERE_SPOTS: LabouchereSpot[]` (Task 1) is reused directly for the table's column iteration (Task 2) — one source of truth for the four spots, in the same order everywhere (dropdown, table header, table columns).
