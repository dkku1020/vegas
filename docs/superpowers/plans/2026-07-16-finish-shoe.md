# Finish Shoe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Finish Shoe" control to the Play tab that free-rolls every remaining hand until the cut card is reached, behind a confirmation dialog.

**Architecture:** A new `FINISH_SHOE` reducer action loops the existing zero-stake hand logic (same settlement pattern as `FREE_HAND`) until `isPastCutCard` is true, refunding any bets that were on the table first. `Table.tsx` gets a new button that opens a local confirmation dialog before dispatching it.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react (jsdom).

## Global Constraints

- `gameReducer.ts` on disk currently uses double-quote/semicolon TypeScript style (an unrelated pending formatting change already in the working tree) — match that style in Task 1. All other files in this plan (`gameReducer.test.ts`, `Table.tsx`, `Table.css`, `Table.test.tsx`) use the project's normal single-quote/no-semicolon style — match that style in Task 2.
- Run `npm test` and `npm run typecheck` before each commit; both must pass.

---

### Task 1: `FINISH_SHOE` reducer action

**Files:**
- Modify: `src/renderer/src/state/gameReducer.ts`
- Test: `src/renderer/src/state/gameReducer.test.ts`

**Interfaces:**
- Consumes: `isPastCutCard(shoe: Shoe): boolean` and `playHand(shoe: Shoe): PlayHandResult` (both already imported in this file), `computeSettlement(bets: Bets, outcome): Settlement` (already imported).
- Produces: `{ type: 'FINISH_SHOE' }` added to the `GameAction` union, handled by `gameReducer`. Later tasks (Task 2) dispatch this action with no payload.

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/renderer/src/state/gameReducer.test.ts`, inside the existing `describe('gameReducer', ...)` block, after the `REBET` tests (i.e. right before the closing `})` of the describe block). This file uses single-quote/no-semicolon style — match it, even though the file under test now uses double-quote/semicolon style.

```typescript
  it('FINISH_SHOE refunds active bets and free-rolls hands until the cut card is passed', () => {
    const threeNaturalHands: Card[] = [
      ...NATURAL_PLAYER_WIN_CARDS,
      ...NATURAL_PLAYER_WIN_CARDS,
      ...NATURAL_PLAYER_WIN_CARDS
    ]
    const state = stateWithShoe({
      bankroll: 900,
      bets: { player: 100, banker: 0, tie: 0 },
      shoe: makeShoe(threeNaturalHands, 9)
    })
    const next = gameReducer(state, { type: 'FINISH_SHOE' })
    expect(next.phase).toBe('result')
    expect(next.bankroll).toBe(1000)
    expect(next.bets).toEqual({ player: 0, banker: 0, tie: 0 })
    expect(next.shoeHistory).toHaveLength(3)
    expect(next.sessionHistory).toHaveLength(3)
    expect(next.shoe.drawIndex).toBe(12)
  })

  it('FINISH_SHOE continues correctly when starting from the result phase', () => {
    const threeNaturalHands: Card[] = [
      ...NATURAL_PLAYER_WIN_CARDS,
      ...NATURAL_PLAYER_WIN_CARDS,
      ...NATURAL_PLAYER_WIN_CARDS
    ]
    const dealt = gameReducer(
      stateWithShoe({
        bankroll: 900,
        bets: { player: 100, banker: 0, tie: 0 },
        shoe: makeShoe(threeNaturalHands, 9)
      }),
      { type: 'DEAL' }
    )
    expect(dealt.phase).toBe('result')
    expect(dealt.shoeHistory).toHaveLength(1)
    const next = gameReducer(dealt, { type: 'FINISH_SHOE' })
    expect(next.bankroll).toBe(dealt.bankroll) // no double-refund of an already-settled hand
    expect(next.bets).toEqual({ player: 0, banker: 0, tie: 0 })
    expect(next.shoeHistory).toHaveLength(3)
    expect(next.sessionHistory).toHaveLength(3)
  })

  it('FINISH_SHOE does not overwrite lastBets from a prior real wager', () => {
    const dealt = gameReducer(
      stateWithShoe({ bankroll: 900, bets: { player: 100, banker: 0, tie: 0 } }),
      { type: 'DEAL' }
    )
    const afterNewHand = gameReducer(dealt, { type: 'NEW_HAND' })
    const finished = gameReducer(afterNewHand, { type: 'FINISH_SHOE' })
    expect(finished.lastBets).toEqual({ player: 100, banker: 0, tie: 0 })
  })

  it('FINISH_SHOE is a no-op beyond clearing bets when the shoe is already past the cut card', () => {
    const state = stateWithShoe({ phase: 'result', shoe: makeShoe(NATURAL_PLAYER_WIN_CARDS, 0) })
    const next = gameReducer(state, { type: 'FINISH_SHOE' })
    expect(next.shoeHistory).toHaveLength(0)
    expect(next.shoe).toBe(state.shoe)
    expect(next.lastResult).toBe(state.lastResult)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- gameReducer`
Expected: FAIL — `FINISH_SHOE` is not a valid `GameAction` (TypeScript error) and/or the reducer falls through to `default` and returns `state` unchanged, failing the assertions.

- [ ] **Step 3: Implement `FINISH_SHOE` in the reducer**

In `src/renderer/src/state/gameReducer.ts`, add `FINISH_SHOE` to the `GameAction` union (this file uses double-quote/semicolon style — match it):

```typescript
export type GameAction =
  | { type: "PLACE_BET"; spot: BetSpot; amount: number }
  | { type: "CLEAR_BETS" }
  | { type: "DEAL" }
  | { type: "FREE_HAND" }
  | { type: "FINISH_SHOE" }
  | { type: "REBET" }
  | { type: "NEW_HAND" }
  | { type: "ADD_FUNDS"; amount: number }
  | { type: "SET_BANKROLL"; amount: number };
```

Add a new `case` in the `gameReducer` switch statement, directly after the closing `}` of the `"FREE_HAND"` case (before `"REBET"`):

```typescript
    case "FINISH_SHOE": {
      const zeroBets: Bets = { player: 0, banker: 0, tie: 0 };
      let bankroll = state.bankroll;
      if (state.phase === "betting") {
        bankroll += state.bets.player + state.bets.banker + state.bets.tie;
      }
      let shoe = state.shoe;
      let lastResult = state.lastResult;
      let lastSettlement = state.lastSettlement;
      const shoeHistory = [...state.shoeHistory];
      const sessionHistory = [...state.sessionHistory];
      while (!isPastCutCard(shoe)) {
        const result = playHand(shoe);
        const settlement = computeSettlement(zeroBets, result.outcome);
        shoe = result.shoe;
        lastResult = result;
        lastSettlement = settlement;
        const historyEntry: HandHistoryEntry = {
          outcome: result.outcome,
          playerTotal: result.playerTotal,
          bankerTotal: result.bankerTotal,
          netChange: settlement.netChange,
        };
        shoeHistory.push(historyEntry);
        sessionHistory.push(historyEntry);
      }
      return {
        ...state,
        bankroll,
        bets: zeroBets,
        shoe,
        phase: "result",
        lastResult,
        lastSettlement,
        shoeHistory,
        sessionHistory,
      };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- gameReducer`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/state/gameReducer.ts src/renderer/src/state/gameReducer.test.ts
git commit -m "feat: add FINISH_SHOE reducer action to free-roll to the cut card"
```

---

### Task 2: "Finish Shoe" button and confirmation dialog

**Files:**
- Modify: `src/renderer/src/components/Table.tsx`
- Modify: `src/renderer/src/components/Table.css`
- Test: `src/renderer/src/components/Table.test.tsx`

**Interfaces:**
- Consumes: `dispatch({ type: 'FINISH_SHOE' })` from Task 1's `GameAction` union; `isPastCutCard(shoe: Shoe): boolean` from `../engine/shoe` (not yet imported in `Table.tsx`).
- Produces: no new exports — this is a leaf UI change.

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/renderer/src/components/Table.test.tsx`, inside the existing `describe('Table', ...)` block, after the last test (`'shows the burn card indicator...'`):

```typescript
  it('opens a confirmation dialog for Finish Shoe and does nothing until confirmed', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Finish Shoe'))
    expect(screen.getByRole('dialog', { name: 'Finish Shoe' })).toBeInTheDocument()
    expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument()
  })

  it('cancelling the Finish Shoe confirmation leaves the table untouched', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Finish Shoe'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('dialog', { name: 'Finish Shoe' })).toBeNull()
    expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument()
    expect(screen.getByTestId('bet-spot-player')).toHaveTextContent('$25')
  })

  it('confirming Finish Shoe refunds bets, plays out the shoe, and disables the button', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Finish Shoe'))
    fireEvent.click(screen.getByText('Yes, Finish Shoe'))
    await waitFor(() => expect(screen.getByText('Bankroll: $1000.00')).toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Finish Shoe' })).toBeNull()
    expect(screen.getByTestId('bet-spot-player')).toHaveTextContent('$0')
    expect(screen.getByText('Next Hand')).toBeInTheDocument()
    expect(screen.getByText('Finish Shoe')).toBeDisabled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- Table.test`
Expected: FAIL — no element with text `Finish Shoe` exists yet.

- [ ] **Step 3: Implement the button, dialog, and dispatch wiring**

In `src/renderer/src/components/Table.tsx`, add the `isPastCutCard` import alongside the existing `useGame` import:

```typescript
import { useGame } from '../state/GameContext'
import { isPastCutCard } from '../engine/shoe'
```

Add local state and handlers inside `Table()`, alongside the existing `selectedChip` state:

```typescript
  const [selectedChip, setSelectedChip] = useState(5)
  const [showFinishShoeConfirm, setShowFinishShoeConfirm] = useState(false)
```

```typescript
  function handleFinishShoeClick(): void {
    setShowFinishShoeConfirm(true)
  }

  function handleFinishShoeCancel(): void {
    setShowFinishShoeConfirm(false)
  }

  function handleFinishShoeConfirm(): void {
    dispatch({ type: 'FINISH_SHOE' })
    setShowFinishShoeConfirm(false)
  }
```

Place these new functions after `handleNewHand`.

Update the `table__controls` block so the "Finish Shoe" button renders in both phases (outside the `state.phase === 'betting'` conditional), and add the confirmation overlay as a sibling right after `table__controls` closes, still inside the outer `.table` div:

```tsx
      <div className="table__controls">
        <span className="table__bankroll">Bankroll: ${state.bankroll.toFixed(2)}</span>
        {state.phase === 'betting' ? (
          <>
            <button type="button" onClick={handleRebet} disabled={!canRebet}>
              Rebet
            </button>
            <button type="button" onClick={handleClear} disabled={totalWagered === 0}>
              Clear
            </button>
            <button type="button" onClick={handleFreeHand}>
              Free Hand
            </button>
            <button type="button" onClick={handleDeal} disabled={!canDeal}>
              Deal
            </button>
          </>
        ) : (
          <button type="button" onClick={handleNewHand}>
            Next Hand
          </button>
        )}
        <button
          type="button"
          onClick={handleFinishShoeClick}
          disabled={isPastCutCard(state.shoe)}
        >
          Finish Shoe
        </button>
      </div>

      {showFinishShoeConfirm && (
        <div className="table__finish-shoe-overlay">
          <div className="table__finish-shoe-dialog" role="dialog" aria-label="Finish Shoe">
            <p>Simulate to the end of the shoe?</p>
            <p className="table__finish-shoe-dialog-hint">
              Any bets on the table will be refunded, and every remaining hand will be dealt
              automatically.
            </p>
            <div className="table__finish-shoe-dialog-actions">
              <button type="button" onClick={handleFinishShoeCancel}>
                Cancel
              </button>
              <button type="button" onClick={handleFinishShoeConfirm}>
                Yes, Finish Shoe
              </button>
            </div>
          </div>
        </div>
      )}
```

In `src/renderer/src/components/Table.css`, append:

```css
.table__finish-shoe-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.table__finish-shoe-dialog {
  background: #1c1c1c;
  color: #fff;
  padding: 24px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  max-width: 320px;
  text-align: center;
}

.table__finish-shoe-dialog-hint {
  font-size: 0.85rem;
  opacity: 0.8;
  margin: 0;
}

.table__finish-shoe-dialog-actions {
  display: flex;
  gap: 12px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- Table.test`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: no failures, no type errors.

- [ ] **Step 6: Manual check**

Run: `npm run dev`
In the app: go to the Play tab, place a bet, click "Finish Shoe", confirm the dialog text and Cancel/Confirm buttons appear, click Cancel and verify nothing changed, click "Finish Shoe" again and confirm — verify the bankroll refunds correctly, the big road fills in with the rest of the shoe's hands, and the "Finish Shoe" button is now disabled on the result screen.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/Table.tsx src/renderer/src/components/Table.css src/renderer/src/components/Table.test.tsx
git commit -m "feat: add Finish Shoe button with confirmation dialog to the Play tab"
```
