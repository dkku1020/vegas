# Finish Shoe (Design)

## Problem

Analyzing big road patterns currently requires manually clicking through every remaining hand in a shoe. There's no way to fast-forward to the end of the shoe from the Play tab.

## Goal

Add a "Finish Shoe" control to the Play tab that free-rolls every remaining hand until the cut card is reached, so the completed big road is ready for review/Analyze without manual clicking. Guard it behind a confirmation dialog since it's a large, hard-to-undo jump in state.

## Reducer: `FINISH_SHOE` action

Added to `GameAction` in `gameReducer.ts`. Takes no payload.

Behavior:
1. If `state.phase === 'betting'` and there are bets on the table, refund them to bankroll (same refund behavior as `FREE_HAND`). `lastBets` is left untouched (same as `FREE_HAND`), so `REBET` continues to work off the last real wager after the shoe finishes.
2. Loop: play a hand with zero bets (`playHand` + `computeSettlement` against `{ player: 0, banker: 0, tie: 0 }`), append the resulting `HandHistoryEntry` to both `shoeHistory` and `sessionHistory`, and repeat while `!isPastCutCard(shoe)`.
3. Works starting from either `betting` or `result` phase — no requirement to clear bets or advance past the current result first.
4. Final state: `phase: 'result'`, `lastResult`/`lastSettlement` set to the final simulated hand, `bets` zeroed, shoe **not** reshuffled. This mirrors a normal hand result screen, so existing UI (big road, Analyze button, Next Hand) behaves unchanged.

If the shoe is already past the cut card when dispatched (should only happen transiently), the loop runs zero times — a no-op aside from the bet refund.

## UI: `Table.tsx`

- New "Finish Shoe" button added to the `table__controls` row, shown regardless of phase (`betting` or `result`), disabled when `isPastCutCard(state.shoe)` is true.
- Clicking it opens a confirmation overlay, following the same visual pattern as the existing `RebuyDialog` (dark fixed backdrop, centered card): "Simulate to the end of the shoe?" with Cancel / Confirm buttons.
- The dialog's open/closed state is local to `Table.tsx` (`useState`); no prop drilling through `App.tsx`/`PlayScreen` is needed since the trigger is a button local to `Table`.
- Confirm dispatches `{ type: 'FINISH_SHOE' }` and closes the dialog. Cancel just closes it.
- New overlay/dialog CSS added to `Table.css` (not shared with `RebuyDialog.css`, which is intentionally single-purpose per existing project convention).

## Out of scope

- No animation/progressive reveal of hands as they're simulated — the jump is instantaneous (a shoe is ~70-80 hands, computationally trivial).
- No change to `FREE_HAND`, `DEAL`, or `NEW_HAND` semantics.
- No auto-reshuffle into a new shoe after finishing — user reviews the completed board and clicks "Next Hand" when ready, same as any other hand result.

## Testing

- Reducer: unit tests in `gameReducer.test.ts` covering: refund of active bets, looping until past cut card, correctness starting from `result` phase, no-op safety when already past cut card, `lastBets` preserved for `REBET`.
- Component: tests in `Table.test.tsx` covering: button disabled when past cut card, confirmation dialog appears on click, cancel closes without dispatching, confirm dispatches `FINISH_SHOE` and closes dialog.
