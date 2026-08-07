# Final Sequence Completion Hand — Design

## Context

`analyzeLabouchereCompletions` (`src/renderer/src/engine/analyze.ts`) already
returns `completions: number[]` — every hand index where a Labouchere
sequence completed. `computePeakSequenceNumber` (`src/renderer/src/engine/strategy.ts`)
already replays a session's history to report the highest sequence number
reached, and `SimulatePanel.tsx` aggregates it across trials as
"Avg peak sequence number" / "Highest peak seen".

This adds a companion stat: **which hand the last sequence completion
happened at.** It's most meaningful alongside `noNewSequenceAfter`
(`2026-08-06-sequence-safety-net-design.md`) — since a triggered safety net
means no further completions can ever happen in that shoe, this value is
exactly the point after which the strategy sits out for the rest of the
shoe — but it's generically useful info independent of whether the safety
net is active, so it isn't gated on it.

## Behavior

- **Hand numbering is 1-based** everywhere this is displayed ("hand 42"),
  matching how a player would count hands at a table. This is a new
  convention — no other part of the UI currently displays a hand number —
  established here for both tabs to share.
- If a Labouchere sequence never completes in the given history, there is
  no "final completion hand" to show, and the UI shows nothing for it
  (same pattern as `avgPeak`/`maxPeak` in `SimulatePanel.tsx`, which are
  only rendered when non-null).

## `analyze.ts` — no engine change needed

The Analyze tab reviews one specific already-played shoe. `completions`
already contains every completion index in order; the last element
(`completions[completions.length - 1]`) *is* the 0-based index of the
final completion. This is purely a UI change (below) — converting that
existing value to 1-based and rendering it.

## `strategy.ts` — new helper for the Simulate tab

The Simulate tab runs many randomized trials via `runSimulation`'s
`onSessionComplete` hook, which only exposes the trial's full
`sessionHistory` (no `analyze.ts` involved — that engine only exists for
replaying a real, already-recorded shoe). A new helper is needed, mirroring
`computePeakSequenceNumber`'s existing shape exactly (same `seen`-array
replay), but tracking the last index where a real, wagered bet won and
collapsed the sequence to empty, instead of tracking the peak value:

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

- **The `wager <= 0` gate mirrors the exact fix already applied to
  `analyze.ts`'s completion counting**
  (`2026-08-06-sequence-safety-net-design.md`'s "second, pre-existing
  bug" section): a completion can only genuinely happen on a hand that
  was actually wagered and won — a zero-wager sit-out (whether from
  `skipAfter` or `noNewSequenceAfter`) can never itself be a completion,
  it can only leave an already-empty sequence empty. Skipping those hands
  before ever calling `deriveLabouchereSequence` means the "last" index
  recorded is always the hand that actually caused the completion, never
  a later sit-out hand that merely observed it.
- Returns `null` when the sequence never completes anywhere in `history`
  — same "no data" signal `computePeakSequenceNumber` doesn't need (it
  always has a well-defined peak, since the starting sequence itself
  counts) but this one does.
- Same O(n²) tradeoff already accepted for `computePeakSequenceNumber`
  (replaying `deriveLabouchereSequence` over a growing prefix each hand)
  — no new complexity class.

## UI changes

### `AnalyzePanel.tsx`

- Add a results line, shown only when `completions.length > 0`:
  `Final sequence completed at hand {completions[completions.length - 1] + 1}`
  (the `+ 1` converts the existing 0-based index to a 1-based hand
  number). No new state, no new engine call — purely reads the existing
  `completions` result already stored in state.

### `SimulatePanel.tsx`

- Per trial, inside the existing `onSessionComplete` callback (which
  already computes `avgPeak`/`maxPeak` via `computePeakSequenceNumber`),
  also call `computeLastCompletionIndex(parsedSequence, parsedUnit, sessionHistory)`
  and collect the non-null results (converted to 1-based) into a new
  array, mirroring the existing `peaks` array.
- After the run, if that array is non-empty: compute and store an average
  and a max, rendered as two new lines following the existing
  peak-stat lines:
  `Avg final sequence completed at hand: {N.toFixed(1)}` /
  `Latest final sequence completed at hand: {N}`. If no trial ever
  completed a sequence, the array is empty and neither line renders —
  same conditional-render pattern as `avgPeak`/`maxPeak` (`!== null`
  checks), reused here with the same null-when-empty convention.
- Trials where the sequence never completed are simply excluded from the
  average and max, not treated as `0` (that would corrupt both stats
  toward the low end for no reason — "never completed" is a different
  fact than "completed at hand 0").

## Files touched

1. `src/renderer/src/engine/strategy.ts` — new `computeLastCompletionIndex`
   export.
2. `src/renderer/src/engine/strategy.test.ts` — returns the correct index
   for a single completion; returns the *last* index when the sequence
   completes and restarts multiple times; returns `null` when it never
   completes; ignores zero-wager hands (doesn't mistake a
   `skipAfter`/`noNewSequenceAfter` sit-out immediately following a
   completion for a *later* completion — mirrors the exact scenario the
   `analyze.ts` completions-double-counting fix already covers, just for
   this new function).
3. `src/renderer/src/components/AnalyzePanel.tsx` — new results line.
4. `src/renderer/src/components/AnalyzePanel.test.tsx` — line renders with
   the correct 1-based hand number when a completion exists; does not
   render when `completions` is empty.
5. `src/renderer/src/components/SimulatePanel.tsx` — new aggregation
   alongside the existing peak aggregation, two new results lines.
6. `src/renderer/src/components/SimulatePanel.test.tsx` — the new lines
   appear after a run where at least one trial completes a sequence.

## Known tradeoff

None new beyond what `computePeakSequenceNumber` already accepts (see
above) — this is the same O(n²)-per-trial replay pattern, not a new one.
