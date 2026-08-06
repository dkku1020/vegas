# Skip Bet After Loss — Follow/Counter Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `skipAfter` (the "skip bet after N losses" rule) work for `'follow'`/`'counter'` Labouchere spots, not just fixed `'player'`/`'banker'` spots, in both the engine and the Simulate/Analyze UI tabs.

**Architecture:** `labouchere()` in `strategy.ts` gains a new backward-scan helper, `countDynamicLossStreak`, that measures the follow/counter strategy's own would-have-lost streak (instead of a fixed spot's loss streak) and wires it into the existing skip check. `analyze.ts`'s skipped-hand detection is generalized to work for all four spot modes. Both UI panels drop their player/banker-only gate on the "Skip bet after (losses)" field.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react.

## Global Constraints

- `skipAfter` must remain an optional positive integer for all spot modes; the "must be a positive integer" validation error text is unchanged: `` `Skip-after must be a positive integer, got ${skipAfter}` `` (engine) / `` `Skip bet after must be a positive integer, got "${text}"` `` (UI parsing).
- No new complexity class: `countDynamicLossStreak` must be a single O(n) backward pass, not O(n) re-derivations of `resolveDynamicSpot` per candidate hand (see spec's "Known tradeoff").
- Ties never count as a win or a loss in any streak calculation, and never reset a streak — this matches existing `countLossStreak` behavior and must hold for the new dynamic version too.
- Follow: bet the same side as the previous decisive outcome. Counter: bet the opposite side. (Existing `resolveDynamicSpot` behavior — unchanged.)

Reference spec: `docs/superpowers/specs/2026-08-06-skip-bet-after-follow-counter-design.md`

---

## File Structure

- Modify `src/renderer/src/engine/strategy.ts` — drop the follow/counter throw on `skipAfter`, add `countDynamicLossStreak`, wire it into the per-hand skip check.
- Modify `src/renderer/src/engine/strategy.test.ts` — replace the two throw tests with dynamic-loss-streak behavior tests.
- Modify `src/renderer/src/engine/analyze.ts` — generalize skipped-hand detection to all spot modes.
- Modify `src/renderer/src/engine/analyze.test.ts` — replace the throw test with follow/counter skipped-detection tests.
- Modify `src/renderer/src/components/SimulatePanel.tsx` — remove the player/banker gate on the Skip bet after field.
- Modify `src/renderer/src/components/SimulatePanel.test.tsx` — update the "hides for follow/counter" test to "shows for follow/counter".
- Modify `src/renderer/src/components/AnalyzePanel.tsx` — same gate removal.
- Modify `src/renderer/src/components/AnalyzePanel.test.tsx` — same test update, plus an end-to-end skipped-count test for follow.

---

### Task 1: Engine — allow `skipAfter` on follow/counter with a dynamic loss streak

**Files:**
- Modify: `src/renderer/src/engine/strategy.ts`
- Test: `src/renderer/src/engine/strategy.test.ts`

**Interfaces:**
- Consumes: existing `SimHandRecord`, `StrategyContext`, `LabouchereSpotMode`, `resolveDynamicSpot` (stays private, unchanged), `countLossStreak` (stays private, unchanged) — all already defined in `strategy.ts`.
- Produces: `labouchere(spotMode, sequence, unit, skipAfter?)` now accepts `skipAfter` for `'follow'`/`'counter'` too. No new exports — `countDynamicLossStreak` stays a private module function, matching `countLossStreak`'s visibility.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('labouchere', ...)` block in `src/renderer/src/engine/strategy.test.ts`, replacing the two tests `'throws when skip-after is combined with a follow spot'` and `'throws when skip-after is combined with a counter spot'` (currently around lines 286–292) with:

```ts
  it('no longer throws when skip-after is combined with a follow spot', () => {
    expect(() => labouchere('follow', [1, 2], 5, 2)).not.toThrow()
  })

  it('no longer throws when skip-after is combined with a counter spot', () => {
    expect(() => labouchere('counter', [1, 2], 5, 2)).not.toThrow()
  })

  it('skips the bet after N consecutive dynamic losses for follow', () => {
    // Walking the shoe: after hand0(banker), follow predicts banker for hand1 — hand1 is
    // player, a loss. After hand1(player), follow predicts player for hand2 — hand2 is
    // banker, a loss. Two dynamic losses in a row, so the next bet (hand4) sits out.
    const strategy = labouchere('follow', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'player', netChange: -25 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('keeps betting while the follow dynamic loss streak is below the threshold', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5, 3)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'player', netChange: -25 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    // Same history as above but skip-after is 3, so the 2-loss streak isn't enough to sit
    // out yet. The resolved spot for the next hand is 'banker' (the last decisive outcome).
    expect(strategy(context).banker).toBeGreaterThan(0)
  })

  it('skips the bet after N consecutive dynamic losses for counter', () => {
    // Counter predicts the opposite of the previous decisive outcome. After hand0(banker),
    // counter predicts player for hand1 — hand1 is banker, a loss. After hand1(banker),
    // counter predicts player for hand2 — hand2 is banker, a loss. Two in a row → sit out.
    const strategy = labouchere('counter', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('does not count ties toward the follow dynamic loss streak', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'player', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('resumes follow betting the hand after the dynamic pick wins outright', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'player', netChange: -25 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 }
      ],
      sessionHistory: []
    }
    // Hand 4 (index 3): predicted = outcome of hand 3 = banker; actual = banker → win.
    // So the streak resets to 0 and hand 5 (about to be bet) bets normally.
    expect(strategy(context).banker).toBeGreaterThan(0)
  })

  it('resets the follow dynamic loss streak at the start of a new shoe', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'player', netChange: -25 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'banker', netChange: -25 }
      ]
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })
```

Note the last test: with an empty `shoeHistory`, `resolveDynamicSpot('follow', [])` returns `null`, so the strategy already returns an all-zero bet regardless of the skip-after streak (mirrors the existing "resets to no bet at the start of a new shoe" test at line 181) — it's asserting the no-bet-yet case, not a skip-triggered case, which is the correct behavior at a shoe boundary.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: The two "no longer throws" tests fail (current code still throws), and the new dynamic-loss-streak tests fail (current code throws on construction for `skipAfter` + follow/counter, since that validation runs before the returned closure is even created).

- [ ] **Step 3: Implement `countDynamicLossStreak` and wire it in**

In `src/renderer/src/engine/strategy.ts`, add this function right after `countLossStreak` (after line 70):

```ts
function countDynamicLossStreak(mode: 'follow' | 'counter', shoeHistory: SimHandRecord[]): number {
  const decisive = shoeHistory.map((r) => r.outcome).filter((o) => o !== 'tie')
  let streak = 0
  for (let i = decisive.length - 1; i >= 1; i--) {
    const predicted = mode === 'follow' ? decisive[i - 1] : decisive[i - 1] === 'player' ? 'banker' : 'player'
    if (decisive[i] === predicted) break
    streak += 1
  }
  return streak
}
```

Then update the validation block (lines 92–101) to drop the follow/counter restriction:

```ts
  if (skipAfter !== undefined) {
    if (!Number.isInteger(skipAfter) || skipAfter <= 0) {
      throw new Error(`Skip-after must be a positive integer, got ${skipAfter}`)
    }
  }
```

Finally, update the skip check inside the returned closure (lines 121–123) to use the right streak counter for the resolved spot mode:

```ts
    if (skipAfter !== undefined) {
      const streak =
        spotMode === 'player' || spotMode === 'banker'
          ? countLossStreak(spot, context.shoeHistory)
          : countDynamicLossStreak(spotMode, context.shoeHistory)
      if (streak >= skipAfter) {
        return bets
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/strategy.test.ts`
Expected: PASS — all tests in the file, including the existing fixed-spot skip-after tests (unaffected) and the new dynamic ones.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/strategy.ts src/renderer/src/engine/strategy.test.ts
git commit -m "feat: allow skip-bet-after-loss on follow/counter Labouchere spots"
```

---

### Task 2: Engine — generalize skipped-hand detection in `analyzeLabouchereCompletions`

**Files:**
- Modify: `src/renderer/src/engine/analyze.ts`
- Test: `src/renderer/src/engine/analyze.test.ts`

**Interfaces:**
- Consumes: `labouchere` (from Task 1, now accepts `skipAfter` for all spot modes), `SimHandRecord`, `LabouchereSpotMode` — all already imported in `analyze.ts`.
- Produces: `analyzeLabouchereCompletions(history, spotMode, sequence, unit, skipAfter?)` — same signature and `AnalyzeLabouchereResult` shape (`{ completions, skipped, peakNumber, peakIndex }`), now correctly populating `skipped` for `'follow'`/`'counter'` too.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/engine/analyze.test.ts`, replace the test `'throws when skip-after is combined with a follow spot, mirroring labouchere() validation'` (lines 60–62) with:

```ts
  it('no longer throws when skip-after is combined with a follow spot', () => {
    expect(() => analyzeLabouchereCompletions([], 'follow', [1, 2], 5, 2)).not.toThrow()
  })

  it('reports skipped hands for a follow spot loss streak, ignoring the undetermined first hand', () => {
    // Hand 0 (banker): shoeHistory is empty — no decisive predecessor, spot is undetermined,
    // not counted as a skip.
    // Hand 1 (player): shoeHistory=[banker], only 1 decisive record — countDynamicLossStreak
    // needs a predecessor-of-a-predecessor to find any loss, so streak=0. Bets banker for
    // real (loses to the actual 'player' outcome, but that's just a normal loss, not a skip).
    // Hand 2 (banker): shoeHistory=[banker, player] — follow would have predicted banker
    // (from hand 0) for hand 1, but hand 1 was player: that's 1 dynamic loss. skipAfter=1
    // means this hand sits out.
    const history = [entry('banker'), entry('player'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'follow', [1, 2, 3, 4], 5, 1)
    expect(result.skipped).toEqual([2])
  })

  it('does not report the undetermined first hand of a shoe as skipped for follow', () => {
    const history = [entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'follow', [1, 2, 3, 4], 5, 1)
    expect(result.skipped).toEqual([])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: The "no longer throws" test fails (current code still throws via `labouchere()`'s validation, until Task 1 lands — if Task 1 is already committed, this instead fails because `analyze.ts`'s own skipped-detection is still player/banker-only, so the two new skipped-detection tests fail with `result.skipped` empty/wrong).

- [ ] **Step 3: Generalize the skipped-detection check**

In `src/renderer/src/engine/analyze.ts`, replace the check at lines 40–46:

```ts
    if (
      skipAfter !== undefined &&
      (spotMode === 'player' || spotMode === 'banker') &&
      bets[spotMode] === 0
    ) {
      skipped.push(i)
    }
```

with:

```ts
    const totalWagered = bets.player + bets.banker + bets.tie
    const hasResolvableSpot =
      spotMode === 'player' ||
      spotMode === 'banker' ||
      sessionHistory.some((r) => r.outcome !== 'tie')

    if (skipAfter !== undefined && totalWagered === 0 && hasResolvableSpot) {
      skipped.push(i)
    }
```

Note `sessionHistory` at this point in the loop (before `sessionHistory.push(record)` on line 54) holds exactly the hands strictly before `i` — the same prefix `strategy(...)` used internally to resolve the spot for hand `i`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/analyze.test.ts`
Expected: PASS — all tests, including existing fixed-spot skipped-detection tests (unaffected, since `hasResolvableSpot` is always `true` for player/banker) and the new follow tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/analyze.ts src/renderer/src/engine/analyze.test.ts
git commit -m "feat: report skipped hands for follow/counter in analyzeLabouchereCompletions"
```

---

### Task 3: UI — show Skip bet after field for follow/counter in Simulate and Analyze tabs

**Files:**
- Modify: `src/renderer/src/components/SimulatePanel.tsx`
- Modify: `src/renderer/src/components/AnalyzePanel.tsx`
- Test: `src/renderer/src/components/SimulatePanel.test.tsx`
- Test: `src/renderer/src/components/AnalyzePanel.test.tsx`

**Interfaces:**
- Consumes: `labouchere` (Task 1) via `SimulatePanel`'s `handleRun`; `analyzeLabouchereCompletions` (Task 2) via `AnalyzePanel`'s `handleStartAnalysis`. No signature changes to either — only the gating condition around the existing `skipAfter` state/field changes.
- Produces: no new exports; this task only changes JSX conditionals and the two `handleRun`/`handleStartAnalysis` functions' `parsedSkipAfter` computation.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/components/SimulatePanel.test.tsx`, replace the test `'hides the Skip bet after field for follow/counter spots'` (lines 90–95) with:

```ts
  it('shows the Skip bet after field for follow/counter spots', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'counter' } })
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('runs a Labouchere simulation with skip bet after set on a follow spot', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })
```

In `src/renderer/src/components/AnalyzePanel.test.tsx`, replace the test `'hides the Skip bet after field for follow/counter spots'` (lines 71–75) with:

```ts
  it('shows the Skip bet after field for follow/counter spots', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('runs an analysis with skip bet after set on a follow spot and shows dimmed cells', () => {
    // Same history/math as the analyze.ts test above: only hand index 2 ends up skipped.
    const history: HandHistoryEntry[] = [entry('banker'), entry('player'), entry('banker')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('1 hands skipped')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: FAIL — the field is not found (`getByLabelText` throws) because both panels still hide it for follow/counter.

- [ ] **Step 3: Remove the player/banker gate in both panels**

In `src/renderer/src/components/SimulatePanel.tsx`, change line 151:

```tsx
            {(labouchereSpot === 'player' || labouchereSpot === 'banker') && (
```

to:

```tsx
            {(
              <label>
```

Concretely, remove the conditional wrapper entirely — replace lines 151–161:

```tsx
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
```

with:

```tsx
            <label>
              Skip bet after (losses)
              <input
                type="text"
                value={skipAfter}
                onChange={(e) => setSkipAfter(e.target.value)}
                placeholder="e.g. 4"
              />
            </label>
```

Then update `handleRun` (lines 73–80) to pass `skipAfter` unconditionally:

```ts
        const strategy = labouchere(labouchereSpot, parsedSequence, parsedUnit, parseSkipAfter(skipAfter))
```

In `src/renderer/src/components/AnalyzePanel.tsx`, replace lines 110–120:

```tsx
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
```

with:

```tsx
        <label>
          Skip bet after (losses)
          <input
            type="text"
            value={skipAfter}
            onChange={(e) => setSkipAfter(e.target.value)}
            placeholder="e.g. 4"
          />
        </label>
```

Then update `handleStartAnalysis` (lines 63–64) to drop the gate:

```ts
      const parsedSkipAfter = parseSkipAfter(skipAfter)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/SimulatePanel.test.tsx src/renderer/src/components/AnalyzePanel.test.tsx`
Expected: PASS — all tests in both files, including the "hides for Flat Bet" test in `SimulatePanel.test.tsx` (unaffected — that gate is on `strategyType`, not spot) and the two removed/replaced tests' successors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/SimulatePanel.tsx src/renderer/src/components/SimulatePanel.test.tsx src/renderer/src/components/AnalyzePanel.tsx src/renderer/src/components/AnalyzePanel.test.tsx
git commit -m "feat: show Skip bet after field for follow/counter spots in Simulate and Analyze tabs"
```

---

## Self-Review Notes

- **Spec coverage:** Engine dynamic loss streak (Task 1) ✓; `analyze.ts` generalized skipped detection (Task 2) ✓; both UI panels' gate removal (Task 3) ✓; `BigRoad` needs no changes per spec — confirmed in Task 3's Analyze test, which exercises `.big-road__cell--skipped` end-to-end through the existing prop.
- **Placeholder scan:** No TBD/TODO; every step has literal code.
- **Type consistency:** `countDynamicLossStreak(mode: 'follow' | 'counter', shoeHistory: SimHandRecord[]): number` matches its one call site in Task 1 Step 3. `analyzeLabouchereCompletions`'s signature and `AnalyzeLabouchereResult` shape are unchanged from Task 2's "Consumes/Produces," matching the single caller `AnalyzePanel.tsx` already uses.
