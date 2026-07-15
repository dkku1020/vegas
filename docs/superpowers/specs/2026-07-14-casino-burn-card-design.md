# Casino Burn Card — Design

## Context

Real baccarat tables burn cards at the start of every fresh shoe: after
shuffling, the dealer flips the top card face-up as an "indicator," then
discards (burns) that many additional cards face-down before dealing begins.
The indicator's value follows blackjack-style counting, not baccarat scoring:
Ace = 1, 2–9 = pip value, and 10/J/Q/K = 10. (This differs from the existing
`cardValue` in `rules.ts`, which scores 10/J/Q/K as 0 for baccarat hand
totals — that function is untouched.)

The simulator currently has a single point where a fresh shoe is created:
`createShoe()` in `src/renderer/src/engine/shoe.ts`. Both the Play tab
(`gameReducer.ts`, on initial load and on `NEW_HAND` when
`isPastCutCard(shoe)`) and the Simulate tab (`simulate.ts`, on initial shoe
and on every reshuffle) call this function. Implementing burn behavior here
means both tabs get it automatically and consistently.

## Goal

Every freshly created shoe burns cards the way a real casino does: reveal the
top card as an indicator, then remove that many additional cards from play.
The Play tab shows the indicator card and burn count; the Simulate tab
incorporates the effect silently (it already reuses `createShoe`).

## Counting convention

Confirmed: the indicator card counts *in addition to* the burned cards, not
as one of them. A 6 removes 7 cards total from the shoe (1 indicator + 6
burned). This matches standard casino procedure.

## Algorithm — `src/renderer/src/engine/shoe.ts`

- Add `burnCardValue(rank: Rank): number`: `A` → 1, `10`/`J`/`Q`/`K` → 10,
  otherwise the numeric rank. Kept separate from `rules.ts`'s `cardValue`
  (baccarat scoring) since the two conventions disagree on ten-value cards.
- Add `BurnInfo { indicatorCard: Card; cardsBurned: number }`, where
  `cardsBurned` is the total removed from play (indicator + N more).
- Extend `Shoe` with a `burn: BurnInfo` field.
- In `createShoe`, after shuffling:
  1. `cutIndex` is computed exactly as today, from the full `cards.length`
     (the cut card's physical position in the shoe is unaffected by burning).
  2. The indicator is `cards[0]`. `N = burnCardValue(indicator.rank)`.
  3. `drawIndex` starts at `N + 1` instead of `0`, skipping the indicator and
     the N burned cards.
  4. `burn = { indicatorCard: cards[0], cardsBurned: N + 1 }`.
- No additional calls to `randomFn` — burning only shifts the starting
  `drawIndex`, so RNG determinism (and therefore Simulate-tab reproducibility
  via seeded `mulberry32`) is unaffected.
- With an 8-deck (416-card) shoe, the maximum possible burn (11 cards for a
  ten-value indicator) is negligible next to the 14-card cut-card reserve;
  no risk of `drawIndex` exceeding `cutIndex` on a fresh shoe.

## Play tab — `Table.tsx`

- No `GameState` shape change needed: `state.shoe.burn` already carries what
  the UI needs, and it updates automatically whenever `createShoe()` runs
  (initial load in `createInitialState`, and on `NEW_HAND` when
  `isPastCutCard` triggers a reshuffle in `gameReducer.ts`).
- Add a small persistent status line to `Table.tsx`, rendering the indicator
  card (via the existing `PlayingCard` component) plus text, e.g.:
  `Burn card: 6♣ → 7 cards burned.` It always reflects `state.shoe.burn`, so
  it naturally changes only when a new shoe is created — no timers or extra
  state required.

## Simulate tab

- No code changes beyond `shoe.ts`. `simulate.ts` already calls
  `createShoe(randomFn)` for the initial shoe and every reshuffle after the
  cut card, so burn behavior is automatically folded into simulated
  statistics. No UI surface, per requirements.

## Testing

- `shoe.test.ts`:
  - Update the existing "starts at `drawIndex: 0`" assertion — a fresh shoe
    now starts past the burn.
  - New cases: a numeric-rank indicator burns `value` additional cards
    (`cardsBurned === value + 1`); an Ace burns 1 additional card
    (`cardsBurned === 2`); a face-card indicator burns 10 additional cards
    (`cardsBurned === 11`); `cutIndex` is unaffected by the burn amount.
- `Table.test.tsx`: add a case asserting the burn status line renders with
  the correct indicator card and count for a given seeded shoe.

## Files touched

1. `src/renderer/src/engine/shoe.ts` — `burnCardValue`, `BurnInfo`, extended
   `Shoe`, updated `createShoe`.
2. `src/renderer/src/engine/shoe.test.ts` — updated/new coverage above.
3. `src/renderer/src/components/Table.tsx` (+ `.css` if needed) — burn status
   line.
4. `src/renderer/src/components/Table.test.tsx` — burn status line coverage.
