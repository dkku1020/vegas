# Sequence Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "safety net" to the Labouchere strategy: past a configurable number of hands played in the current shoe, stop starting brand-new sequences (while letting any sequence already in progress finish normally), in the engine and both the Simulate and Analyze tabs.

**Architecture:** `labouchere()` in `strategy.ts` gains a 5th optional parameter, `noNewSequenceAfter`, checked at the one place a new sequence can start (the existing "derived sequence is empty, fall back to the initial sequence" branch). `analyze.ts` threads the new parameter through and widens its `skipped`-hand condition (currently gated on `skipAfter` alone) so it also fires for safety-net sit-outs. Fixing `analyze.ts` also requires a one-line correctness fix to its completion-counting, described below — a pre-existing bug that this feature is what actually exercises it. Both UI panels get a new field, ungated by spot mode.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react.

## Global Constraints

- `noNewSequenceAfter` is an optional positive integer, independent of `skipAfter` and independent of `spotMode` — applies identically to `'player'`, `'banker'`, `'follow'`, `'counter'`.
- Validation error text (engine): `` `No-new-sequence-after must be a positive integer, got ${noNewSequenceAfter}` ``.
- Validation error text (UI parsing, both panels): `` `No new sequence after must be a positive integer, got "${text}"` ``.
- Trigger condition: the derived sequence has just collapsed to empty (a sequence completion) **and** `context.shoeHistory.length >= noNewSequenceAfter`. This never interrupts a sequence already in progress — the check only runs inside the "sequence is empty" branch.
- The hands-played count is `context.shoeHistory.length`, which already resets to `0` on every new shoe (both `simulateSession` and the Analyze tab's single-shoe history) — no extra bookkeeping.
- Once triggered, the strategy stays at zero-wager for the rest of that shoe (falls out naturally: zero-wager hands don't change the derived sequence, so it stays empty on every later hand until a new shoe resets `shoeHistory`).
- UI field label (both panels): "No new sequence after (hands)".

Reference spec: `docs/superpowers/specs/2026-08-06-sequence-safety-net-design.md`

---

## File Structure

- Modify `src/renderer/src/engine/strategy.ts` — `labouchere()` new param, validation, updated fallback block.
- Modify `src/renderer/src/engine/strategy.test.ts` — new-sequence blocking behavior, in-progress sequences unaffected, boundary conditions, shoe-boundary reset, validation errors.
- Modify `src/renderer/src/engine/analyze.ts` — thread the new param through; widen the `skipped` condition; fix the completions double-counting bug.
- Modify `src/renderer/src/engine/analyze.test.ts` — safety-net sit-outs reported as skipped without `skipAfter` set; completions not double-counted across multiple sit-out hands.
- Modify `src/renderer/src/components/SimulatePanel.tsx` — new field, state, parsing, pass-through.
- Modify `src/renderer/src/components/SimulatePanel.test.tsx` — field visibility, end-to-end run, validation error.
- Modify `src/renderer/src/components/AnalyzePanel.tsx` — same field, state, parsing, pass-through.
- Modify `src/renderer/src/components/AnalyzePanel.test.tsx` — field visibility, end-to-end run showing a dimmed sit-out, validation error.

---

### Task 1: Engine — `noNewSequenceAfter` in `labouchere()`

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Consumes: existing `SimHandRecord`, `StrategyContext`, `LabouchereSpotMode`, `deriveLabouchereSequence` — all already defined in `strategy.ts`.
- Produces: `labouchere(spotMode, sequence, unit, skipAfter?, noNewSequenceAfter?)` — the new 5th parameter. No new exports.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('labouchere', ...)` block in `src/renderer/src/engine/strategy.test.ts` (anywhere after the existing `skipAfter` tests is fine):

```ts
  it('blocks a new sequence once the hands-played threshold is met', () => {
    const strategy = labouchere('banker', [3], 5, undefined, 1)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ]
    }
    // sessionHistory: one wagered hand that won, collapsing [3] to []. shoeHistory.length (1)
    // >= threshold (1), so the strategy must NOT fall back to a fresh [3] sequence.
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('does not interrupt a sequence already in progress, regardless of hands played', () => {
    const strategy = labouchere('banker', [1, 2, 3, 4], 5, undefined, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'player', netChange: -25 },
        { bets: { player: 0, banker: 30, tie: 0 }, outcome: 'player', netChange: -30 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'player', netChange: -25 },
        { bets: { player: 0, banker: 30, tie: 0 }, outcome: 'player', netChange: -30 }
      ]
    }
    // Two losses extend [1,2,3,4] to [1,2,3,4,5,6] — never empty, so the safety-net check
    // (which only runs when the derived sequence IS empty) never applies, even though
    // shoeHistory.length (2) already meets the threshold (2).
    expect(strategy(context).banker).toBeGreaterThan(0)
  })

  it('allows a new sequence to start when below the hands-played threshold', () => {
    const strategy = labouchere('banker', [3], 5, undefined, 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ]
    }
    // shoeHistory.length (1) is below the threshold (5), so falling back to a fresh [3] is fine.
    expect(strategy(context).banker).toBeGreaterThan(0)
  })

  it('blocks exactly at the threshold boundary, not one hand later', () => {
    // shoeHistory and sessionHistory are independent inputs to this pure function (same
    // pattern already used elsewhere in this file, e.g. the shoe-boundary-reset test): only
    // sessionHistory needs the one wagered, won record that collapses [3] to empty — the
    // extra zero-wager records in shoeHistory below are purely padding to control
    // shoeHistory.length (the hands-played count) independently, without affecting sequence
    // derivation, which reads sessionHistory only.
    const strategy = labouchere('banker', [3], 5, undefined, 3)
    const belowContext: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 },
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ]
    }
    // shoeHistory.length (2) is one below the threshold (3): still allowed.
    expect(strategy(belowContext).banker).toBeGreaterThan(0)

    const atContext: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 },
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ]
    }
    // shoeHistory.length (3) meets the threshold (3) exactly: blocked.
    expect(strategy(atContext)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('counts ties toward the hands-played threshold', () => {
    const strategy = labouchere('banker', [3], 5, undefined, 1)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ]
    }
    // A single tied hand still counts as one hand played this shoe, so shoeHistory.length (1)
    // meets the threshold (1) — the hands-played count is a raw array length, unlike the
    // loss-streak counters elsewhere in this file which specifically skip ties.
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('keeps sitting out for the rest of the shoe once the safety net triggers', () => {
    const strategy = labouchere('banker', [3], 5, undefined, 1)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 }
      ]
    }
    // The zero-wager hand right after the completion doesn't advance the derived sequence
    // (deriveLabouchereSequence skips zero-wager records entirely), so it's still empty here,
    // and shoeHistory.length (2) still meets the threshold (1).
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('resets the hands-played count at a new shoe boundary', () => {
    const strategy = labouchere('banker', [3], 5, undefined, 1)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ]
    }
    // sessionHistory still shows a completed sequence (carried over from the prior shoe), but
    // shoeHistory is freshly empty (new shoe), so 0 < threshold (1): a new sequence is allowed.
    expect(strategy(context).banker).toBeGreaterThan(0)
  })

  it('can trigger even when skip-after is also set but its own condition is not met', () => {
    const strategy = labouchere('banker', [3], 5, 5, 1)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ],
      sessionHistory: [
        { bets: { player: 0, banker: 15, tie: 0 }, outcome: 'banker', netChange: 15 }
      ]
    }
    // skipAfter=5 would need 5 consecutive losses against 'banker' to trigger — nowhere close
    // here (the only hand recorded is a WIN). noNewSequenceAfter=1 triggers independently.
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('throws when no-new-sequence-after is zero', () => {
    expect(() => labouchere('banker', [1, 2], 5, undefined, 0)).toThrow()
  })

  it('throws when no-new-sequence-after is negative', () => {
    expect(() => labouchere('banker', [1, 2], 5, undefined, -1)).toThrow()
  })

  it('throws when no-new-sequence-after is not an integer', () => {
    expect(() => labouchere('banker', [1, 2], 5, undefined, 1.5)).toThrow()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: FAIL — `labouchere` doesn't accept a 5th argument yet (TypeScript will actually reject the extra argument at the type level before tests even run; that's the expected RED state here — a compile-time rejection is the correct "fails for the expected reason" signal for a parameter that doesn't exist yet).

- [ ] **Step 3: Implement**

In `src/renderer/src/engine/strategy.ts`, change the `labouchere` signature (currently around line 83-88):

```ts
export function labouchere(
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number,
  skipAfter?: number,
  noNewSequenceAfter?: number
): Strategy {
```

Add validation right after the existing `skipAfter` validation block (currently lines 103-107):

```ts
  if (noNewSequenceAfter !== undefined) {
    if (!Number.isInteger(noNewSequenceAfter) || noNewSequenceAfter <= 0) {
      throw new Error(
        `No-new-sequence-after must be a positive integer, got ${noNewSequenceAfter}`
      )
    }
  }
```

Replace the existing fallback block (currently lines 117-120):

```ts
    let current = deriveLabouchereSequence(initialSequence, unit, context.sessionHistory)
    if (current.length === 0) {
      current = initialSequence
    }
```

with:

```ts
    let current = deriveLabouchereSequence(initialSequence, unit, context.sessionHistory)
    if (current.length === 0) {
      if (noNewSequenceAfter !== undefined && context.shoeHistory.length >= noNewSequenceAfter) {
        return { player: 0, banker: 0, tie: 0 }
      }
      current = initialSequence
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: PASS — all tests in the file, including every pre-existing test (unaffected — `noNewSequenceAfter` defaults to `undefined` and the new branch is a no-op when it is).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: add a sequence safety net to stop starting new Labouchere sequences past a hand threshold"
```

---

### Task 2: Engine — thread the safety net through `analyzeLabouchereCompletions`, fix completion double-counting

**Files:**
- Modify: `src/renderer/src/engine/analyze.ts`
- Test: `src/renderer/src/engine/analyze.test.ts`

**Interfaces:**
- Consumes: `labouchere` (Task 1, now accepts `noNewSequenceAfter` as its 5th param).
- Produces: `analyzeLabouchereCompletions(history, spotMode, sequence, unit, skipAfter?, noNewSequenceAfter?)` — the new 6th parameter. Return shape `{ completions, skipped, peakNumber, peakIndex }` unchanged.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('analyzeLabouchereCompletions', ...)` block in `src/renderer/src/engine/analyze.test.ts`:

```ts
  it('reports safety-net sit-outs as skipped even when skip-after is not set, without inflating completions', () => {
    const history = [entry('banker'), entry('banker'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3], 5, undefined, 1)
    // Hand 0: fresh [3], bets banker, wins — completes the sequence (completions: [0]).
    // Hand 1: derived sequence is now empty; shoeHistory.length (1) meets the threshold (1),
    // so the safety net blocks a fresh restart — a zero-wager sit-out, reported as skipped.
    // Hand 2: still empty (the sit-out didn't touch it), shoeHistory.length (2) still meets
    // the threshold — another sit-out, also skipped.
    // Without the completions fix below, hands 1 and 2 would ALSO be double-counted as
    // completions, since the derived sequence merely stayed empty rather than being newly
    // completed by either of them.
    expect(result.skipped).toEqual([1, 2])
    expect(result.completions).toEqual([0])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: FAIL. `result.skipped` will be `[]` instead of `[1, 2]` (the current `skipped` push is gated on `skipAfter !== undefined`, which is `undefined` here). `result.completions` will be `[0, 1, 2]` instead of `[0]` (the pre-existing double-counting bug).

- [ ] **Step 3: Implement**

In `src/renderer/src/engine/analyze.ts`, change the `analyzeLabouchereCompletions` signature (currently lines 17-23):

```ts
export function analyzeLabouchereCompletions(
  history: HandHistoryEntry[],
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number,
  skipAfter?: number,
  noNewSequenceAfter?: number
): AnalyzeLabouchereResult {
```

Update the `labouchere(...)` call (currently line 24):

```ts
  const strategy = labouchere(spotMode, sequence, unit, skipAfter, noNewSequenceAfter)
```

Widen the skipped-hand check (currently lines 46-48):

```ts
    if (
      (skipAfter !== undefined || noNewSequenceAfter !== undefined) &&
      totalWagered === 0 &&
      hasResolvableSpot
    ) {
      skipped.push(i)
    }
```

Fix the completions double-counting (currently lines 59-67):

```ts
    const remaining = deriveLabouchereSequence(initialSequence, unit, sessionHistory)
    if (remaining.length === 0) {
      if (totalWagered > 0) {
        completions.push(i)
      }
    } else {
      const currentMax = Math.max(...remaining)
      if (currentMax > peakNumber) {
        peakNumber = currentMax
        peakIndex = i
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: PASS — all tests in the file, including every pre-existing completions/peak/skipped assertion (unaffected — verified by hand that none of the existing tests exercise a zero-wager hand immediately following a completion, so the `totalWagered > 0` gate changes nothing for them).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/analyze.ts src/renderer/src/engine/analyze.test.ts
git commit -m "feat: report safety-net sit-outs in analyzeLabouchereCompletions, fix completion double-counting on sit-out hands"
```

---

### Task 3: UI — "No new sequence after (hands)" field in Simulate and Analyze tabs

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Modify: `src/renderer/src/components/SimulatePanel.test.tsx`
- Modify: `src/renderer/src/components/AnalyzePanel.tsx`
- Modify: `src/renderer/src/components/AnalyzePanel.test.tsx`

**Interfaces:**
- Consumes: `labouchere` (Task 1) via `SimulatePanel`'s `handleRun`; `analyzeLabouchereCompletions` (Task 2) via `AnalyzePanel`'s `handleStartAnalysis`.
- Produces: no new exports; new local state, a new parse helper per file (matching the existing `parseSkipAfter` per-file duplication pattern already in both components), and new JSX.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/components/SimulatePanel.test.tsx`, add (anywhere after the existing skip-after tests):

```ts
  it('shows the No new sequence after field for Labouchere regardless of spot', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    expect(screen.getByLabelText('No new sequence after (hands)')).toBeInTheDocument()
  })

  it('hides the No new sequence after field for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    expect(screen.queryByLabelText('No new sequence after (hands)')).not.toBeInTheDocument()
  })

  it('runs a Labouchere simulation with No new sequence after set', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('No new sequence after (hands)'), {
      target: { value: '50' }
    })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('shows an error when No new sequence after is not a positive integer', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('No new sequence after (hands)'), {
      target: { value: '-1' }
    })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })
```

In `src/renderer/src/components/AnalyzePanel.test.tsx`, add (anywhere after the existing skip-after tests):

```ts
  it('shows the No new sequence after field', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    expect(screen.getByLabelText('No new sequence after (hands)')).toBeInTheDocument()
  })

  it('runs an analysis with No new sequence after set and shows the safety-net sit-out as a dimmed skipped hand', () => {
    const history: HandHistoryEntry[] = [entry('banker'), entry('banker'), entry('player')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'banker' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('No new sequence after (hands)'), {
      target: { value: '1' }
    })
    fireEvent.click(screen.getByText('Start Analysis'))

    // Same history/math as the analyze.ts test in Task 2: one completion (hand 0), two
    // safety-net sit-outs (hands 1 and 2).
    expect(screen.getByText('Sequence completed 1 times')).toBeInTheDocument()
    expect(screen.getByText('2 hands skipped')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(2)
  })

  it('shows an error when No new sequence after is not a positive integer', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('No new sequence after (hands)'), {
      target: { value: 'abc' }
    })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-error')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: FAIL — `getByLabelText('No new sequence after (hands)')` throws because the field doesn't exist yet in either panel.

- [ ] **Step 3: Implement**

In `src/renderer/src/components/SimulatePanel.tsx`:

Add a parse helper right after the existing `parseSkipAfter` (currently lines 29-37):

```ts
function parseNoNewSequenceAfter(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`No new sequence after must be a positive integer, got "${text}"`)
  }
  return value
}
```

Add state right after the existing `skipAfter` state (currently line 48):

```ts
  const [noNewSequenceAfter, setNoNewSequenceAfter] = useState('')
```

Update the `labouchere(...)` call inside `handleRun` (currently lines 73-78):

```ts
        const strategy = labouchere(
          labouchereSpot,
          parsedSequence,
          parsedUnit,
          parseSkipAfter(skipAfter),
          parseNoNewSequenceAfter(noNewSequenceAfter)
        )
```

Add the field's JSX right after the existing "Skip bet after (losses)" label (currently lines 149-157, inside the Labouchere branch):

```tsx
            <label>
              No new sequence after (hands)
              <input
                type="text"
                value={noNewSequenceAfter}
                onChange={(e) => setNoNewSequenceAfter(e.target.value)}
                placeholder="e.g. 50"
              />
            </label>
```

In `src/renderer/src/components/AnalyzePanel.tsx`:

Add the same parse helper right after the existing `parseSkipAfter` (currently lines 30-38):

```ts
function parseNoNewSequenceAfter(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`No new sequence after must be a positive integer, got "${text}"`)
  }
  return value
}
```

Add state right after the existing `skipAfter` state (currently line 44):

```ts
  const [noNewSequenceAfter, setNoNewSequenceAfter] = useState('')
```

Update `handleStartAnalysis` (currently lines 61-70):

```ts
  function handleStartAnalysis(): void {
    try {
      const parsedSkipAfter = parseSkipAfter(skipAfter)
      const parsedNoNewSequenceAfter = parseNoNewSequenceAfter(noNewSequenceAfter)
      const result = analyzeLabouchereCompletions(
        history as HandHistoryEntry[],
        spot,
        parseSequence(sequence),
        Number(unit),
        parsedSkipAfter,
        parsedNoNewSequenceAfter
      )
```

(The rest of the function body — `setCompletions`, `setSkipped`, etc. — is unchanged.)

Add the field's JSX right after the existing "Skip bet after (losses)" label (currently lines 109-117):

```tsx
        <label>
          No new sequence after (hands)
          <input
            type="text"
            value={noNewSequenceAfter}
            onChange={(e) => setNoNewSequenceAfter(e.target.value)}
            placeholder="e.g. 50"
          />
        </label>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: PASS — all tests in both files, including every pre-existing test (unaffected).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS on every test this branch touches. Two pre-existing, unrelated failures are known to exist in this repo (`src/renderer/src/state/gameReducer.test.ts` and `src/renderer/src/components/Table.test.tsx`, about table-max bet-stacking logic, untouched by this or any prior Labouchere-related work) — do not attempt to fix them as part of this task; report them if seen, but they are not a blocker.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx src/renderer/src/components/SimulatePanel.test.tsx src/renderer/src/components/AnalyzePanel.tsx src/renderer/src/components/AnalyzePanel.test.tsx
git commit -m "feat: add No new sequence after field to Simulate and Analyze tabs"
```

---

## Self-Review Notes

- **Spec coverage:** Engine safety-net logic (Task 1) ✓; `analyze.ts` pass-through, widened skipped condition, and completions double-counting fix (Task 2) ✓; both UI panels' new field (Task 3) ✓. `BigRoad.tsx` needs no changes per spec — confirmed in Task 3's Analyze test, which exercises `.big-road__cell--skipped` end-to-end through the existing prop, same as the prior skip-after-follow-counter feature.
- **Placeholder scan:** No TBD/TODO; every step has literal code and hand-traced test math.
- **Type consistency:** `labouchere(spotMode, sequence, unit, skipAfter?, noNewSequenceAfter?)` in Task 1 matches its call sites in Task 2 (`analyze.ts`) and Task 3 (`SimulatePanel.tsx`). `analyzeLabouchereCompletions(history, spotMode, sequence, unit, skipAfter?, noNewSequenceAfter?)` in Task 2 matches its call site in Task 3 (`AnalyzePanel.tsx`). Return shape `AnalyzeLabouchereResult` is unchanged throughout.
