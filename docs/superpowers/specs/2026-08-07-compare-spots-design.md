# Compare Spots — Design

## Context

The Simulate tab (`src/renderer/src/components/SimulatePanel.tsx`) runs one
Labouchere configuration against one spot mode (`'player'`, `'banker'`,
`'follow'`, or `'counter'`) at a time via the "Run" button. Comparing spots
today means manually re-running four times and remembering the numbers.
This adds a **"Compare Spots"** action: run the same configuration (same
sequence, unit, skip-after, safety net, bankroll, shoes per session, and
trial count) against all four spots at once, and show all four results side
by side in a table.

Labouchere-only, per brainstorming: `'follow'`/`'counter'` don't exist for
Flat Bet, and the request was specifically about the four Labouchere spot
modes.

## Behavior

- A new "Compare Spots" button sits next to the existing "Run" button,
  visible only when `strategyType === 'labouchere'` (same visibility gate
  as the rest of the Labouchere-only fields).
- Clicking it reads the same form fields "Run" already reads (sequence,
  unit, skip bet after, no new sequence after, starting bankroll, shoes
  per session, trials) — validated with the exact same parsing functions,
  so an invalid value produces the exact same error message either button
  would produce. The currently-selected Spot dropdown value
  (`labouchereSpot`) is **ignored** — the whole point is running all four,
  not the one currently selected.
- Runs four full simulations (`player`, `banker`, `follow`, `counter`),
  each exactly what "Run" already does per-spot: build a `labouchere(...)`
  strategy, call `runSimulation`, and track peak-sequence-number and
  final-completion-hand stats via the existing `onSessionComplete` hook —
  reusing 100% of existing engine code, no engine changes.
- Results render in a new table, one column per spot, one row per stat —
  every stat the single "Run" view already shows: Trials, Avg net profit,
  Median net profit, Bust rate, Best trial, Worst trial, Avg hands played,
  Avg peak sequence number, Highest peak seen, Avg final sequence
  completed at hand, Latest final sequence completed at hand. Same
  formatting (`.toFixed()`, `$`, `%`) as the single-run view, for
  side-by-side comparability.
- Unlike the single-run view (which hides the peak/completion-hand lines
  entirely when there's nothing to report), the compare table always shows
  those rows — a spot's cell for "Avg/Latest final sequence completed at
  hand" shows `—` if that spot never completed a sequence across its
  trials, since a table can't selectively hide one column's row without
  breaking the table shape. (`avgPeak`/`maxPeak` are never null — a peak
  value always exists, even without a completion — so those two rows never
  need a placeholder.)
- The compare table and the single-run results are **independent** — each
  button only updates its own results block; running one doesn't clear or
  hide the other. Both can be visible at the same time.
- Shared error state: a validation failure from either button shows in the
  same error banner already used for "Run" (`data-testid="simulate-error"`),
  and clears only that action's own results (Compare Spots clears
  `compareResults`; Run clears `result`/peak/completion state, unchanged
  from today).
- No progress indicator or chunking: at the stated scale (up to
  ~5,000 trials per spot, so ~20,000 total), this runs synchronously and
  finishes fast enough that no loading state is needed — consistent with
  how "Run" already behaves at its own trial counts.

## Refactor: extract the shared per-spot run logic

`handleRun`'s Labouchere branch and the new Compare Spots handler need the
identical "build strategy, run simulation, track peak/completion stats"
sequence. Rather than duplicate it, extract a local helper:

```ts
type LabouchereSpot = 'player' | 'banker' | 'follow' | 'counter'

interface LabouchereRunResult {
  result: SimulationResult
  avgPeak: number
  maxPeak: number
  avgFinalCompletionHand: number | null
  maxFinalCompletionHand: number | null
}

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

This is pure extraction — `handleRun`'s existing behavior for the
Labouchere branch is unchanged, just routed through the shared function.
The existing `LABOUCHERE_SPOTS` array and `labouchereSpot` state's inline
`'player' | 'banker' | 'follow' | 'counter'` union type are also switched
to reuse the new `LabouchereSpot` alias, so the file has one definition of
this union instead of three — a direct, minimal cleanup enabled by this
task, not a separate one.

## `handleCompareSpots`

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

New state: `const [compareResults, setCompareResults] = useState<Record<LabouchereSpot, LabouchereRunResult> | null>(null)`.

## UI

- New button "Compare Spots" next to "Run", inside the Labouchere-only
  JSX branch (same visibility condition already gating Spot/Skip
  bet-after/No new sequence after/Sequence/Unit).
- New results block below the existing single-run results, rendered only
  when `compareResults !== null`:
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
          {/* one <tr> per stat, one <td> per spot, formatted identically
              to the single-run block; "—" for null completion-hand cells */}
        </tbody>
      </table>
    </div>
  )}
  ```
  The exact row set and formatting mirrors the single-run block's existing
  eleven stat lines one-for-one.

## Files touched

1. `src/renderer/src/components/SimulatePanel.tsx` — `LabouchereSpot` type
   alias, `LabouchereRunResult` interface, `runLabouchereSimulation`
   helper, `handleRun`'s Labouchere branch refactored to call it, new
   `compareResults` state, new `handleCompareSpots`, new button, new table.
2. `src/renderer/src/components/SimulatePanel.test.tsx` — button visible
   only for Labouchere; compare run populates the table with all four
   spots' stats; validation error surfaces the same way as "Run"'s;
   running "Run" and "Compare Spots" don't clear each other's results.

## Known tradeoff

Running Compare Spots is exactly 4x the work of a single "Run" at the same
trial count — no new complexity class, just a constant-factor multiplier,
consistent with the scale decision above (thousands of trials per spot,
not tens of thousands+).
