# Sequence Peak Tracker — Design

## Context

The Labouchere sequence rule (`deriveLabouchereSequence` in
`src/renderer/src/engine/strategy.ts`) already implements exactly the
mechanic being asked for: a win crosses off the first and last numbers, a
loss appends their sum to the end. This feature adds no new betting logic —
it's a new **stat** derived from replaying that existing rule: the highest
single number the sequence ever contained while the shoe/session played out,
surfaced in the Analyze tab (with the specific hand marked on the board) and
as a summary stat in the Simulate tab.

References: `2026-07-14-labouchere-strategy-design.md` (the sequence rule
itself), `2026-08-05-skip-bet-after-design.md` (the most recent precedent
for extending `analyzeLabouchereCompletions`'s return shape and adding a
third `BigRoad` marker type).

## Behavior

- **What counts as "seen":** the max over the starting sequence itself
  (baseline — the user sees those numbers before anything happens) and
  every number ever appended after a loss.
- **Resets carry the same baseline, not a new one.** `deriveLabouchereSequence`
  already resets to the initial sequence whenever a completed cycle is
  followed by a new wager. Because the initial sequence is constant, this
  reset never lowers the running peak and never needs special-casing — the
  peak is simply the max over every sequence state the replay ever produces,
  including the very first (pre-hand) state.
- **A skipped hand (Skip Bet After) cannot move the peak.** A zero-wager
  hand is already invisible to `deriveLabouchereSequence` (`wager <= 0`
  filter), so it produces no new sequence state.
- **Works identically across every spot mode** (`player`, `banker`,
  `follow`, `counter`) — the sequence rule itself doesn't care which side
  the wager landed on, only the wager amount and win/loss, same as today.
- **The "peak hand"** (Analyze tab only) is the hand where the running peak
  first strictly increased — always a loss (only losses append new
  numbers), so it can never be the same hand as a sequence completion
  (always a win) or a skipped hand (no wager). If the peak is only ever the
  starting sequence's own max — never exceeded — there is no peak hand to
  mark, only the number.

## Core engine changes (`strategy.ts`)

- New exported function:
  ```ts
  export function computePeakSequenceNumber(
    initialSequence: number[],
    unit: number,
    history: SimHandRecord[]
  ): number
  ```
  Starts `peak = Math.max(...initialSequence)`. Replays `history` one
  record at a time, growing a `seen` array and calling the existing
  `deriveLabouchereSequence(initialSequence, unit, seen)` after each record
  (same incremental-replay technique `analyze.ts` already uses for
  completions — reuses `deriveLabouchereSequence` as a black box, doesn't
  duplicate its internals). Whenever the resulting sequence is non-empty,
  updates `peak` to the max of itself and the sequence's own max. Returns
  the final `peak`.
- `labouchere()` itself is unchanged — this is a read-only analysis
  function over the same history shape the strategy already produces.

## `analyze.ts` changes

- `AnalyzeLabouchereResult` gains two fields:
  ```ts
  { completions: number[]; skipped: number[]; peakNumber: number; peakIndex: number | null }
  ```
- Computed inline in the existing per-hand loop, which already computes
  `remaining = deriveLabouchereSequence(...)` after every hand for
  completion detection: initialize `peakNumber = Math.max(...sequence)` and
  `peakIndex = null` before the loop; after computing `remaining` each
  iteration, if `remaining.length > 0` and its max exceeds the running
  `peakNumber`, update `peakNumber` and set `peakIndex = i`. No separate
  replay pass — this rides along the loop that's already there, so
  `computePeakSequenceNumber` itself is not called from `analyze.ts` (it
  exists for `SimulatePanel.tsx`'s use, see below).

## UI changes

### `AnalyzePanel.tsx`

- New results line, always shown alongside the existing "Sequence completed
  N times" and "N hands skipped" lines: `"Highest sequence number: {peakNumber}"`.
- `BigRoad` receives a new prop, `peakIndex={result.peakIndex}`.

### `BigRoad.tsx` / `BigRoad.css`

- New optional prop `peakIndex?: number | null` — singular, not a `Set`,
  since there is at most one peak hand (unlike `highlightIndices` /
  `skippedIndices`, which can each match many hands). Uses the same
  `getBigRoadPositions` lookup as the existing props; if `peakIndex` lands
  on a tie (no board position), nothing renders — matches how the other two
  index props already degrade for tie indices.
- Matching cell gets class `big-road__cell--peak`.
- CSS: a colored ring around the circle, distinct from the yellow
  `--highlight` background and the dimmed-opacity `--skipped` treatment:
  ```css
  .big-road__cell--peak .big-road__circle {
    box-shadow: 0 0 0 2px #8e44ad;
  }
  ```

### `simulate.ts`

- `SimulateSessionConfig` and `RunSimulationConfig` each gain an optional
  hook:
  ```ts
  onSessionComplete?: (sessionHistory: SimHandRecord[]) => void
  ```
  `simulateSession` calls it once, right before returning, with that
  trial's full `sessionHistory` (already built internally regardless — no
  new storage cost). `runSimulation` forwards its own `onSessionComplete`
  straight through to every `simulateSession` call in its trial loop. This
  keeps `SimSessionResult`/`SimulationResult` unchanged and keeps the core
  simulation engine strategy-agnostic — it has no idea what the callback
  does with the history.

### `SimulatePanel.tsx`

- When running a Labouchere simulation, passes an `onSessionComplete`
  callback that calls `computePeakSequenceNumber(sequence, unit, sessionHistory)`
  for that trial and collects the results into a local array (not stored in
  component state per-trial — only the aggregate is).
- Two new result lines, shown only when `strategyType === 'labouchere'`:
  `"Avg peak sequence number: X"` (average across trials, in raw sequence
  units — not a dollar amount, consistent with how the Analyze tab reports
  it) and `"Highest peak seen: X"` (the max across all trials) — mirroring
  the existing avg/best-worst pattern already in the results panel. Not
  shown for Flat Bet (the concept doesn't apply).

## Files touched

1. `src/renderer/src/engine/strategy.ts` — add `computePeakSequenceNumber`.
2. `src/renderer/src/engine/strategy.test.ts` — peak computation: starting
   sequence as baseline, growth via losses, reset-carries-forward, no
   change during a Skip Bet After sit-out.
3. `src/renderer/src/engine/analyze.ts` — widen `AnalyzeLabouchereResult`,
   compute `peakNumber`/`peakIndex` inline.
4. `src/renderer/src/engine/analyze.test.ts` — peak number and peak index
   cases, including the "never exceeded, no peak hand" case (`peakIndex === null`).
5. `src/renderer/src/engine/simulate.ts` — add `onSessionComplete` to both
   config types, wire it through `simulateSession` and `runSimulation`.
6. `src/renderer/src/engine/simulate.test.ts` — hook fires once per trial
   with that trial's full session history.
7. `src/renderer/src/components/BigRoad.tsx` / `BigRoad.css` — `peakIndex`
   prop and marker styling.
8. `src/renderer/src/components/BigRoad.test.tsx` — peak cell gets the new
   class; degrades correctly when `peakIndex` is `null`/omitted/on a tie.
9. `src/renderer/src/components/AnalyzePanel.tsx` — new results line, wire
   `peakIndex` into `BigRoad`.
10. `src/renderer/src/components/AnalyzePanel.test.tsx` — results line
    renders the right number; board shows the peak marker on the right
    hand.
11. `src/renderer/src/components/SimulatePanel.tsx` — `onSessionComplete`
    wiring, two new result lines gated on Labouchere.
12. `src/renderer/src/components/SimulatePanel.test.tsx` — new lines appear
    only for Labouchere; values are sane for a deterministic seeded run.

## Known tradeoff

`computePeakSequenceNumber` reuses the same O(n²)-per-session incremental
replay already accepted for `deriveLabouchereSequence` callers (see
`2026-07-14-labouchere-strategy-design.md`). `analyze.ts`'s inline
peak-tracking is free (rides the loop it already runs), but the Simulate
side calls `computePeakSequenceNumber` once per trial, each an O(n²) replay
over that trial's full session history — consistent with, not worse than,
the existing accepted cost of running a Labouchere strategy through
`runSimulation` at all.
