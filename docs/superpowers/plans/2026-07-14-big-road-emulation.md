# Big Road Emulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Big Road scoreboard always render a full 6×40 pre-drawn grid, show ties as a green line (with a count badge for 2+ consecutive ties) through the previous circle instead of a `/` glyph, and move the board to a full-width row above a stacked Table + Stats panel.

**Architecture:** `bigRoad.ts` (the pure column/row/streak placement algorithm) is unchanged — it already produces a `(BigRoadCell | null)[][]` with correct streak, dragon-tail, and tie-count semantics, verified by its existing test suite. All work is in the presentation layer: `BigRoad.tsx`/`.css` switch from rendering only as many columns as there's data to always rendering a fixed-size CSS grid, and restyle the tie marker; `App.tsx`/`.css` switch the top-level layout from a single row to a full-width board row over a stacked table/stats row.

**Tech Stack:** React 18 + TypeScript, Vitest + @testing-library/react (jsdom environment), plain CSS (no CSS-in-JS or Tailwind in this repo).

## Global Constraints

- Test command: `npm test` (runs `vitest run`). Run targeted files with `npx vitest run <path>`.
- Path alias `@shared` maps to `src/shared` (used for `HandHistoryEntry` imports in tests) — follow existing import style in each file.
- Component tests use `// @vitest-environment jsdom` at the top of the file and `@testing-library/react`'s `render` — follow the existing pattern in `BigRoad.test.tsx` / `App.test.tsx`.
- No pair tracking in this plan — out of scope per the design spec (`docs/superpowers/specs/2026-07-14-big-road-emulation-design.md`).
- Do not modify `bigRoad.ts`'s placement algorithm or `Table.tsx`/`StatsPanel.tsx` internals — only their container/consumers change.

---

### Task 1: Fixed 6×40 grid in the Big Road board

**Files:**
- Modify: `src/renderer/src/state/bigRoad.ts` (export `ROWS`)
- Modify: `src/renderer/src/components/BigRoad.tsx`
- Modify: `src/renderer/src/components/BigRoad.css`
- Test: `src/renderer/src/components/BigRoad.test.tsx`

**Interfaces:**
- Consumes: `buildBigRoad(history: HandHistoryEntry[]): (BigRoadCell | null)[][]` from `bigRoad.ts` (unchanged signature). `BigRoadCell = { outcome: 'player' | 'banker'; tieCount: number }`.
- Produces: `BigRoad` still exported as `export function BigRoad({ history }: BigRoadProps)`, `data-testid="big-road"` unchanged, class names `.big-road`, `.big-road__cell`, `.big-road__cell--player`, `.big-road__cell--banker` unchanged (relied on by `App.test.tsx` and existing `BigRoad.test.tsx` assertions). `ROWS` now exported from `bigRoad.ts` for Task 1 and Task 2 to share.

- [ ] **Step 1: Write the failing test for the fixed grid size**

Add to `src/renderer/src/components/BigRoad.test.tsx` (inside the existing `describe('BigRoad', ...)` block):

```tsx
  it('always renders a 6x40 grid of cells, even with no history', () => {
    const { container } = render(<BigRoad history={[]} />)
    expect(container.querySelectorAll('.big-road__cell')).toHaveLength(240)
  })

  it('grows past 40 columns instead of clipping data when a shoe runs long', () => {
    const history: HandHistoryEntry[] = Array.from({ length: 41 }, (_, i) =>
      entry(i % 2 === 0 ? 'player' : 'banker')
    )
    const { container } = render(<BigRoad history={history} />)
    expect(container.querySelectorAll('.big-road__cell')).toHaveLength(41 * 6)
    expect(container.querySelectorAll('.big-road__cell--player')).toHaveLength(21)
    expect(container.querySelectorAll('.big-road__cell--banker')).toHaveLength(20)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: FAIL — the current implementation renders `Math.max(grid.length, 1)` columns, so the empty-history case renders 6 cells (1 column), not 240, and the 41-outcome case renders exactly 41 columns worth of `.big-road__cell` but the assertion for 240/246 will fail for the empty case first.

- [ ] **Step 3: Export `ROWS` from `bigRoad.ts`**

In `src/renderer/src/state/bigRoad.ts`, change:

```ts
const ROWS = 6
```

to:

```ts
export const ROWS = 6
```

- [ ] **Step 4: Rewrite `BigRoad.tsx` to always render a fixed-size grid**

Replace the full contents of `src/renderer/src/components/BigRoad.tsx` with:

```tsx
import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad, ROWS } from '../state/bigRoad'
import './BigRoad.css'

const MIN_COLUMNS = 40

interface BigRoadProps {
  history: HandHistoryEntry[]
}

export function BigRoad({ history }: BigRoadProps) {
  const grid = buildBigRoad(history)
  const columnCount = Math.max(grid.length, MIN_COLUMNS)

  const cells = Array.from({ length: columnCount }, (_, colIndex) =>
    Array.from({ length: ROWS }, (_, rowIndex) => {
      const cell = grid[colIndex]?.[rowIndex] ?? null
      return (
        <div
          key={`${colIndex}-${rowIndex}`}
          className={`big-road__cell${cell ? ` big-road__cell--${cell.outcome}` : ''}`}
        >
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

- [ ] **Step 5: Rewrite `BigRoad.css` for the fixed grid layout and frame**

Replace the full contents of `src/renderer/src/components/BigRoad.css` with:

```css
.big-road {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(6, 26px);
  gap: 0;
  background: #f5f1e6;
  padding: 10px;
  border-radius: 12px;
  border: 4px solid #c9a227;
  overflow-x: auto;
  box-sizing: border-box;
  width: 100%;
}

.big-road__cell {
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  border-right: 1px solid #d8d2c2;
  border-bottom: 1px solid #d8d2c2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.big-road__circle {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid transparent;
  box-sizing: border-box;
}

.big-road__cell--player .big-road__circle {
  border-color: #1a5fb4;
}

.big-road__cell--banker .big-road__circle {
  border-color: #c0392b;
}
```

(The `.big-road__tie` and `.big-road__tie-count` rules are added in Task 2 — leave them out for now.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: PASS — all tests in the file, including the two new ones, and the pre-existing `.big-road__cell--player`/`--banker` assertions (still valid since the modifier class stays on the outer `.big-road__cell` div).

- [ ] **Step 7: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS. `bigRoad.test.ts` (data logic) is untouched and should be unaffected. `App.test.tsx`'s existing `getByTestId('big-road')` assertion should still pass since `data-testid="big-road"` is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/state/bigRoad.ts src/renderer/src/components/BigRoad.tsx src/renderer/src/components/BigRoad.css src/renderer/src/components/BigRoad.test.tsx
git commit -m "feat: render Big Road as a fixed 6x40 pre-drawn grid"
```

---

### Task 2: Tie marker as a green line with a consecutive-tie count badge

**Files:**
- Modify: `src/renderer/src/components/BigRoad.css`
- Test: `src/renderer/src/components/BigRoad.test.tsx`

**Interfaces:**
- Consumes: `cell.tieCount: number` (already produced by `buildBigRoad`, already rendered into `.big-road__tie` / `.big-road__tie-count` spans by Task 1's `BigRoad.tsx`). No `.tsx` changes needed in this task — the markup was already added in Task 1, Step 4; this task only adds the missing CSS rules and locks the behavior down with tests.
- Produces: `.big-road__tie` (always present when `tieCount > 0`), `.big-road__tie-count` (present only when `tieCount > 1`, text content equal to `cell.tieCount`).

- [ ] **Step 1: Write the failing tests for tie count behavior**

Add to `src/renderer/src/components/BigRoad.test.tsx` (inside `describe('BigRoad', ...)`):

```tsx
  it('shows no count badge for a single tie', () => {
    const { container } = render(<BigRoad history={[entry('banker'), entry('tie')]} />)
    expect(container.querySelectorAll('.big-road__tie')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__tie-count')).toHaveLength(0)
  })

  it('shows a count badge for consecutive ties on the same cell', () => {
    const { container } = render(
      <BigRoad history={[entry('banker'), entry('tie'), entry('tie'), entry('tie')]} />
    )
    expect(container.querySelectorAll('.big-road__tie')).toHaveLength(1)
    const badge = container.querySelector('.big-road__tie-count')
    expect(badge?.textContent).toBe('3')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: The first new test (single tie, no badge) already PASSES since Task 1's markup only renders `.big-road__tie-count` when `tieCount > 1`. The second test (badge text `'3'`) also PASSES on markup alone since Task 1 already wired `{cell.tieCount}` into the span. Confirm both pass — if either fails, re-check Task 1 Step 4's JSX was applied correctly before continuing.

- [ ] **Step 3: Add the tie line and count badge CSS**

In `src/renderer/src/components/BigRoad.css`, append:

```css
.big-road__tie {
  position: absolute;
  top: 50%;
  left: -4px;
  right: -4px;
  height: 2px;
  background: #1a7a3c;
  transform: translateY(-50%) rotate(45deg);
  pointer-events: none;
}

.big-road__tie-count {
  position: absolute;
  bottom: -6px;
  right: -6px;
  font-size: 0.5rem;
  font-weight: 700;
  color: #1a7a3c;
  line-height: 1;
}
```

- [ ] **Step 4: Run the tests to verify everything still passes**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: PASS — all tests in the file, including the two new ones and all tests from Task 1.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/BigRoad.css src/renderer/src/components/BigRoad.test.tsx
git commit -m "feat: render ties as a green line with a consecutive-tie count badge"
```

---

### Task 3: Full-width Big Road row above a stacked Table + Stats panel

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`
- Test: `src/renderer/src/App.test.tsx`

**Interfaces:**
- Consumes: `BigRoad`, `Table`, `StatsPanel` components (unchanged props/exports). `data-testid` values `"big-road"`, `"table"`, `"stats-panel"` (unchanged, already asserted in existing `App.test.tsx` tests).
- Produces: new wrapper classes `.app__board-row` (contains `BigRoad`, full width) and `.app__table-row` (contains `Table` then `StatsPanel`, stacked vertically) inside `.app__layout`.

- [ ] **Step 1: Write the failing test for the new layout structure**

Add to `src/renderer/src/App.test.tsx` (inside `describe('App', ...)`):

```tsx
  it('places the big road in a full-width row above the stacked table and stats panel', async () => {
    mockElectronAPI(1000)
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    const layout = container.querySelector('.app__layout')
    expect(layout).not.toBeNull()

    const boardRow = layout!.querySelector('.app__board-row')
    const tableRow = layout!.querySelector('.app__table-row')
    expect(boardRow).not.toBeNull()
    expect(tableRow).not.toBeNull()

    expect(boardRow!.contains(screen.getByTestId('big-road'))).toBe(true)
    expect(tableRow!.contains(screen.getByTestId('table'))).toBe(true)
    expect(tableRow!.contains(screen.getByTestId('stats-panel'))).toBe(true)

    const layoutChildren = Array.from(layout!.children)
    expect(layoutChildren.indexOf(boardRow!)).toBeLessThan(layoutChildren.indexOf(tableRow!))
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: FAIL — `.app__board-row` and `.app__table-row` don't exist yet; `layout.querySelector('.app__board-row')` returns `null`.

- [ ] **Step 3: Update `App.tsx` to wrap the board and table/stats separately**

In `src/renderer/src/App.tsx`, replace:

```tsx
      <div className="app__layout">
        <BigRoad history={state.shoeHistory} />
        <Table />
        <StatsPanel history={state.sessionHistory} />
      </div>
```

with:

```tsx
      <div className="app__layout">
        <div className="app__board-row">
          <BigRoad history={state.shoeHistory} />
        </div>
        <div className="app__table-row">
          <Table />
          <StatsPanel history={state.sessionHistory} />
        </div>
      </div>
```

- [ ] **Step 4: Update `App.css` for the column layout**

In `src/renderer/src/App.css`, replace:

```css
.app__layout {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 24px;
  padding: 24px;
}
```

with:

```css
.app__layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 24px;
}

.app__board-row {
  display: flex;
  justify-content: center;
  width: 100%;
}

.app__table-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: PASS — all tests in the file, including the new layout test.

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/App.test.tsx
git commit -m "feat: move Big Road to a full-width row above a stacked table and stats panel"
```

---

### Task 4: Manual verification in the running app

**Files:** none (verification only — no code changes)

**Interfaces:** none.

- [ ] **Step 1: Launch the app**

Run: `npm run dev`
Expected: Electron window opens showing the betting table.

- [ ] **Step 2: Play hands covering the key visual cases**

Place minimum bets and deal repeatedly (or use whatever fast-forward/skip mechanism the UI exposes) until you've observed, by eye, in the running app:
- The Big Road board is visible as a full 6×40 pre-drawn grid (empty outlined squares) from the very first hand, spanning a full-width row above the table.
- A Player win renders a blue outlined circle; a Banker win renders a red outlined circle.
- A tie immediately after a win renders a green diagonal line through that same circle (not a new column).
- Two or more ties in a row on the same cell show a small number badge (e.g. "2") next to the line.
- A streak of more than 6 same-outcome results wraps into a new column at the bottom row (dragon tail) instead of starting a fresh column at the top.
- The Table and Stats panel are stacked vertically beneath the Big Road, not side-by-side next to it.

- [ ] **Step 3: Report results**

If everything matches, note it as verified. If anything looks wrong (e.g. tie line misaligned, grid not spanning full width, layout order wrong), note the specific discrepancy — do not mark the plan complete until the visual behavior matches the spec at `docs/superpowers/specs/2026-07-14-big-road-emulation-design.md`.
