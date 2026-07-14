# Table Quality-of-Life Changes: Free Hand, Rebet, Centered Tie

## Summary

Three quality-of-life changes to the betting table:

1. Move the Tie bet spot to the middle (between Player and Banker).
2. Add a "Free Hand" button that deals and settles a hand with zero wager, without requiring the user to place a bet.
3. Add a "Rebet" button that re-places the previous hand's full bet distribution (across all spots) in one click.

## 1. Tie spot in the middle

`Table.tsx` renders bet spots by mapping over a `SPOTS: BetSpot[]` array in a flex row. Reorder it from `['player', 'banker', 'tie']` to `['player', 'tie', 'banker']`. No CSS changes are required — flexbox lays spots out in array order, and none of the existing styling depends on spot order (styling is keyed by `table__spot--${spot}` class modifiers, not position).

## 2. Free Hand

A hand that deals and resolves against the shoe without any money changing hands, so the user can see a hand play out (and have it count on the Big Road / stats) without betting.

**Behavior:**
- Available only during the `betting` phase (same as Deal).
- If any bets are currently on the table when clicked, they are refunded to the bankroll first (bets reset to zero), then the hand is dealt for zero stakes. This makes Free Hand always safe to click regardless of table state — no separate "clear bets first" step.
- The hand is dealt from the live shoe (consumes cards normally) and appended to `shoeHistory` and `sessionHistory`, so it appears on the Big Road and factors into the stats panel like any other hand.
- Settlement is computed with an all-zero `Bets` object, so `netChange` is always 0 and the bankroll is unaffected by the outcome.
- Transitions to the `result` phase exactly like a normal `DEAL`, so the existing "Next Hand" flow, card display, and win/lose sound logic behave the same (a `netChange` of exactly 0 already means neither win nor lose sound plays, per existing `Table.tsx` logic).
- Does **not** update `lastBets` — a Free Hand does not disturb what Rebet would repeat (see below).

**Reducer:**
- New action `{ type: 'FREE_HAND' }`.
- Guard: no-op unless `phase === 'betting'`.
- Steps: refund `state.bets` into bankroll and zero them out (in memory, not dispatched separately), draw `playHand(shoe)`, compute settlement against a zeroed `Bets`, append history entry, set `lastResult`/`lastSettlement`, move to `result` phase. `lastBets` is carried over unchanged.

## 3. Rebet

Re-places the prior hand's exact bet distribution across all spots (the game already supports splitting a wager across Player/Banker/Tie simultaneously, so Rebet must restore the full combination, not just a single spot).

**Tracking the "last bet":**
- Add `lastBets: Bets | null` to `GameState`, initialized to `null`.
- `DEAL` already requires `totalWagered > 0` to proceed, so on every successful `DEAL`, set `lastBets = state.bets` (a copy of the bets that were just wagered).
- `FREE_HAND` does not modify `lastBets`, so if the user plays a free hand after a real wager, Rebet still targets that last real wager (free hands are transparent to Rebet).

**Reducer:**
- New action `{ type: 'REBET' }`.
- Guard: no-op unless all of the following hold:
  - `phase === 'betting'`
  - current `bets` are all zero (table is empty)
  - `lastBets` is not `null`
  - the total of `lastBets` is `<=` current `bankroll`
- Effect: debit `bankroll` by the `lastBets` total, set `bets = { ...state.lastBets }`.

**UI:**
- "Rebet" button enabled only when the same guard conditions hold (mirrored in `Table.tsx`, since the reducer already no-ops safely but the button should visibly reflect availability).
- Clicking Rebet only re-places the bet — it does not deal. The user still presses Deal afterward, so they can adjust the bet first if desired.

## 4. UI placement

Both new buttons live in the existing `table__controls` row, shown only during the `betting` phase, alongside the current Clear/Deal buttons:

```
[Rebet] [Clear] [Free Hand] [Deal]
```

Rebet is placed first as the "quick re-bet" action; Free Hand sits near Deal since it's an alternate way to progress past the betting phase.

## Out of scope / non-goals

- No changes to payout logic, shoe/rules engine, or Big Road grid logic.
- No persistence of `lastBets` across app restarts (it resets like other in-memory session state).
- No keyboard shortcuts for the new buttons.
