# Big Road Emulation Design

## Context

The Big Road scoreboard (`src/renderer/src/state/bigRoad.ts`, `src/renderer/src/components/BigRoad.tsx`/`.css`) already implements the core real-table placement logic correctly: outcomes are grouped into columns by streak, ties are attributed to the preceding Player/Banker cell rather than starting a new cell, and streaks longer than 6 wrap into "dragon tail" columns at the bottom row. This was confirmed by the existing test suite (`bigRoad.test.ts`, `BigRoad.test.tsx`).

What's missing to match a real casino Big Road:
1. Ties render as a literal `/` text glyph instead of a green line through the circle.
2. There's no pre-drawn grid — the board only renders as many columns as there is data, so with little/no history it looks like a single floating column instead of a full scoreboard frame.
3. The board sits in a horizontal flex row alongside the Table and Stats panel instead of spanning the full width above them.

This spec covers fixing all three. Pair markers (blue/red dots) are explicitly out of scope — the engine doesn't currently track pairs, and the win/tie signal is the only thing this pass needs to capture.

## Goals

- Tie marks render as a green diagonal line through the previous Player/Banker circle, with a small count badge when there are 2+ consecutive ties on the same cell.
- The board always renders a fixed 6×40 grid (240 cells), styled with visible grid lines and an outer frame, so it looks like a real pre-printed scoreboard from the first hand on. If a shoe ever produces more than 40 columns of outcomes, the board scrolls horizontally rather than dropping data.
- The Big Road spans the full width of the screen in its own row above the Table and Stats panel, which stack vertically beneath it.

## Non-goals

- Player/Banker pair tracking and dot markers.
- Changes to the column/streak/dragon-tail placement algorithm in `bigRoad.ts` — it's already correct.
- Changes to `Table` or `StatsPanel` internals.

## Design

### 1. Data layer (`bigRoad.ts`)

No changes. `BigRoadCell.tieCount` already accumulates consecutive ties on the preceding cell, which is exactly what the tie count badge needs.

### 2. Circles (`BigRoad.tsx` / `.css`)

No changes. Cells already render as hollow blue/red outlined circles with no fill and no center glyph, matching real Big Road styling (as opposed to the Bead Plate's solid dot).

### 3. Tie indicator (`BigRoad.tsx` / `.css`)

Replace the `/` text glyph with a green diagonal line drawn across the circle, implemented as a CSS `::after` pseudo-element on the tie marker: absolutely positioned inside the cell, rotated ~45°, colored green (e.g. `#1a7a3c` or similar to read clearly against the board background). When `cell.tieCount > 1`, render a small number badge near the line showing the count (e.g. "2"). Keep the existing `big-road__tie` class as the outer marker wrapper so current test selectors continue to resolve; tests will be extended to assert the line and count text render correctly.

### 4. Fixed board grid (`BigRoad.tsx` / `.css`)

`BigRoad` renders a fixed 6×40 grid (240 cells) on every render, regardless of history length — replacing the current `columnCount = Math.max(grid.length, 1)` derivation with a constant `40`. Cells with data get their circle/tie styling; all other cells render as empty outlined grid squares. If `buildBigRoad` ever returns more than 40 columns (a shoe exceeding 40 columns of outcomes, which shouldn't happen under normal reshuffle rules but isn't structurally prevented), the container's existing `overflow-x: auto` lets the user scroll to see the extra columns rather than clipping or crashing.

Styling: add an outer rounded frame (gold border on a dark background, echoing the reference photo) around the whole grid, and thin internal grid lines between all 240 cells (`border-right`/`border-bottom` on `.big-road__cell`) so the board reads as a spreadsheet grid rather than a loose row of floating circles.

### 5. Page layout (`App.tsx` / `App.css`)

`.app__layout` changes from a single horizontal flex row (`display: flex; align-items: flex-start`) containing `BigRoad`, `Table`, `StatsPanel` side by side, to a vertical column layout:
- Big Road renders as a full-width row at the top (`width: 100%`), with its own internal horizontal scroll if the 40-column grid ever needs it.
- Table and Stats panel stack vertically beneath it, in that order.

No changes to `Table.tsx` or `StatsPanel.tsx` themselves — only their container arrangement in `App.css`.

## Testing

- `bigRoad.test.ts` — unchanged; data logic isn't changing.
- `BigRoad.test.tsx` — update the two tie-related assertions to check for the green line marker and, where applicable, the count badge text. Add a test confirming the grid always renders 240 cells (6×40) even with empty history.
- Manual verification: run the app, play through several hands including a tie and a streak longer than 6, and confirm visually that the grid, tie line, and full-width layout look correct (per the `run` skill / verification-before-completion process).
