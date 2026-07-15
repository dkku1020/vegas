# Analyze Big Road — Design

## Context

The app currently has two top-level modes toggled in `App.tsx`: **Play**
(deal hands against a live shoe, `state.shoeHistory`/`state.sessionHistory`
tracked in `gameReducer`) and **Simulate** (`SimulatePanel`, which runs many
random trials of a chosen `Strategy` via `runSimulation`).

There is currently no way to ask "if I had run strategy X against the shoe I
just played, when would it have completed?" This feature adds that as a third
mode, **Analyze**, seeded from a snapshot of whatever big road is showing on
the Play tab.

The only non-flat strategy today is `labouchere(spot, sequence, unit)`
(`src/renderer/src/engine/strategy.ts`), which tracks a shrinking/growing
sequence across hands and is considered "complete" for one cycle when the
sequence fully empties after a win (see
`docs/superpowers/specs/2026-07-14-labouchere-strategy-design.md`).

## Goal

1. A "Analyze Big Road" button on the Play tab (next to `StatsPanel`, visible
   once `state.shoeHistory.length > 0`) that snapshots the current shoe's
   history and switches to a new "Analyze" tab.
2. The Analyze tab lets the user configure a strategy (today: Labouchere
   only — spot, sequence, unit), then "Start Analysis" replays that strategy
   against the snapshot's actual historical outcomes and highlights, in
   yellow, every big-road cell where the sequence fully completed.

## Data flow

- `App.tsx`'s `AppMode` becomes `'play' | 'simulate' | 'analyze'`.
- `App` owns a new state slot: `analyzedHistory: HandHistoryEntry[] | null`
  (starts `null`).
- `PlayScreen` takes a new prop `onAnalyze: (history: HandHistoryEntry[]) => void`.
  The "Analyze Big Road" button calls `onAnalyze(state.shoeHistory)`.
- `App`'s `onAnalyze` handler sets `analyzedHistory` to that array and sets
  `mode` to `'analyze'`. This is a **frozen snapshot**: subsequent hands
  played on the Play tab do not change what's shown on the Analyze tab unless
  the user clicks "Analyze Big Road" again (which re-snapshots and
  re-navigates).
- `AnalyzePanel` receives `history: HandHistoryEntry[] | null`. If `null`
  (user opened the Analyze tab directly without ever clicking the button), it
  renders an empty-state message instead of the form.
- The analysis itself ignores bankroll/bust — it's a retrospective replay
  over hands that already happened, not a new random simulation. Bets are
  still capped at `TABLE_MAX_BET`, matching live-strategy behavior.

## Analysis engine

New file: `src/renderer/src/engine/analyze.ts`

```ts
export function analyzeLabouchereCompletions(
  history: HandHistoryEntry[],
  spot: 'player' | 'banker',
  sequence: number[],
  unit: number
): number[] // indices into `history` where the sequence fully completed
```

- Validates `spot`/`sequence`/`unit` by constructing `labouchere(spot, sequence, unit)`
  (throws with the existing messages on invalid input — no duplicated
  validation logic).
- Replays hand-by-hand:
  1. Ask the strategy for its bet given the replay-so-far `sessionHistory`.
  2. Settle that bet against the **actual historical outcome**
     `history[i].outcome` via the existing `computeSettlement`.
  3. Push the resulting `SimHandRecord` onto the replay's `sessionHistory`.
  4. Check whether the Labouchere sequence is now empty (fully crossed off)
     using `deriveLabouchereSequence` (see below). If so, record index `i` as
     a completion.
- Ties settle with `netChange === 0` (push) via the existing
  `computeSettlement`, so they neither advance nor break the sequence — no
  special-casing needed in `analyze.ts`.
- A sequence can complete multiple times in one shoe (it resets and starts
  over after each completion, same as live play) — every completion index is
  recorded, not just the first.

**`strategy.ts` change:** export the currently-private `deriveLabouchereSequence`
so `analyze.ts` can call it directly to check emptiness after each replayed
hand, instead of re-implementing the crossing-off algorithm.

## Big road cell mapping

`bigRoad.ts` currently only exposes `buildBigRoad(history): (BigRoadCell | null)[][]`,
with no way to map a `history` index back to the `{col, row}} it landed on.

- Refactor the existing column-tracking loop in `buildBigRoad` into a shared
  internal helper that computes both the grid and a parallel
  `positions: ({ col: number; row: number } | null)[]` array (one entry per
  `history` index; `null` for tie entries, which don't get their own cell).
- `buildBigRoad(history)` keeps its exact current signature/output (existing
  tests in `bigRoad.test.ts` are unaffected).
- Add a new export `getBigRoadPositions(history): ({ col: number; row: number } | null)[]`
  built from the same shared helper.

## UI components

**`App.tsx` / `PlayScreen`:**
- Mode toggle gains an "Analyze" button alongside "Play"/"Simulate".
- Inside `PlayScreen`'s table row, next to `StatsPanel`, render a
  `"Analyze Big Road"` button when `state.shoeHistory.length > 0`.

**`BigRoad.tsx`:**
- New optional prop `highlightIndices?: Set<number>` (indices into the
  `history` passed to this instance).
- Internally computes `getBigRoadPositions(history)`, builds a `col-row`
  lookup for indices present in `highlightIndices`, and adds a
  `big-road__cell--highlight` class to matching cells.
- New CSS rule gives the cell a yellow background fill (`big-road__cell--highlight`),
  layered behind the existing circle outline/tie mark so those stay visible
  on top.

**New `AnalyzePanel.tsx`** (`src/renderer/src/components/AnalyzePanel.tsx` +
`.css`), styled consistently with `SimulatePanel`:
- Props: `history: HandHistoryEntry[] | null`.
- `history === null` → empty-state message: "Send a board over from the Play
  tab first."
- Otherwise, a form:
  - Strategy `<select>` — currently only `Labouchere` (built as a select now
    so adding a second strategy later is a one-line addition, per the
    existing `StrategyType` pattern in `SimulatePanel`).
  - Spot `<select>` — `player` / `banker` (Labouchere excludes `tie`, same as
    `SimulatePanel`).
  - Sequence text input (default `"1,2,3,4"`), parsed with the same
    comma-separated `parseSequence` approach `SimulatePanel` uses.
  - Unit number input (default `5`).
  - "Start Analysis" button.
- On click: build `sequence` via `parseSequence`, call
  `analyzeLabouchereCompletions(history, spot, sequence, unit)` inside a
  try/catch (mirrors `SimulatePanel.handleRun`'s error handling), store the
  resulting indices in local state.
- Render (on success): the `BigRoad` for `history` with
  `highlightIndices={new Set(completions)}`, plus a one-line summary:
  `"Sequence completed N times"` (N can be 0 — that's a valid, meaningful
  result, not an error).
- On error: show the message the same way `SimulatePanel` does
  (`data-testid="analyze-error"`).

## Files touched

1. `src/renderer/src/engine/strategy.ts` — export `deriveLabouchereSequence`.
2. `src/renderer/src/engine/analyze.ts` (new) — `analyzeLabouchereCompletions`.
3. `src/renderer/src/engine/analyze.test.ts` (new) — no completions, one
   completion, multiple completions/restarts in one shoe, ties don't affect
   progression, invalid config throws (mirrors `strategy.test.ts` cases).
4. `src/renderer/src/state/bigRoad.ts` — refactor to add
   `getBigRoadPositions`; `buildBigRoad` output/signature unchanged.
5. `src/renderer/src/state/bigRoad.test.ts` — add coverage for
   `getBigRoadPositions` mirroring existing `buildBigRoad` cases (streaks,
   column changes, ties, dragon-tail overflow).
6. `src/renderer/src/components/BigRoad.tsx` (+ `.css`) — add
   `highlightIndices` prop and yellow highlight styling.
7. `src/renderer/src/components/BigRoad.test.tsx` — assert
   `highlightIndices` highlights the right cell(s).
8. `src/renderer/src/components/AnalyzePanel.tsx` + `.css` (new) — the form
   described above.
9. `src/renderer/src/components/AnalyzePanel.test.tsx` (new) — empty state,
   validation error, happy path (completion count + highlighted cells after
   "Start Analysis").
10. `src/renderer/src/App.tsx` (+ `.css` if needed) — third mode, `analyzedHistory`
    state, `onAnalyze` wiring, "Analyze Big Road" button next to `StatsPanel`.
11. `src/renderer/src/App.test.tsx` — extend for the three-way mode toggle and
    the button → snapshot → navigate flow.

## Out of scope

- Any strategy other than Labouchere (the strategy `<select>` is built to
  extend, but only one option ships now).
- Bankroll/bust modeling in the analysis replay.
- Live-syncing the Analyze tab to further Play-tab hands after the snapshot
  is taken.
