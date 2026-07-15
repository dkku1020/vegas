# Casino Burn Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every freshly created shoe burns cards the way a real casino does — reveal the top card as an indicator, then remove that many additional cards from play — and the Play tab displays the indicator card and burn count.

**Architecture:** `createShoe()` in `src/renderer/src/engine/shoe.ts` is the single point where both the Play tab (`gameReducer.ts`) and Simulate tab (`simulate.ts`) obtain a fresh shoe. Burn logic lives entirely there: after shuffling, the top card becomes the `burn.indicatorCard`, `drawIndex` starts past the indicator plus the burned cards, and the resulting `Shoe.burn` field is exposed for the UI. `Table.tsx` renders `state.shoe.burn` directly since it updates automatically whenever a new shoe is created.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react.

## Global Constraints

- Burn counting: the indicator card counts **in addition to** the burned cards — a 6 removes 7 cards total (1 indicator + 6 burned), not 6 total.
- Burn card values use blackjack-style counting (`A`=1, `2`-`9`=pip, `10`/`J`/`Q`/`K`=10), which is **different** from `rules.ts`'s `cardValue` (baccarat scoring, where `10`/`J`/`Q`/`K`=0). Keep these as separate functions — do not reuse or merge them.
- `cutIndex` is computed from the full shuffled `cards.length` exactly as before; burning only shifts the starting `drawIndex`, never the cut card's position.
- Burning must not call `randomFn` — it only advances an index — so RNG determinism (seeded `mulberry32` reproducibility in the Simulate tab) is unaffected.
- The Simulate tab gets no UI changes; burn behavior reaches it automatically through `createShoe`.

---

### Task 1: Burn logic in the shoe engine

**Files:**
- Modify: `src/renderer/src/engine/shoe.ts`
- Test: `src/renderer/src/engine/shoe.test.ts`
- Modify (fixture repair, see Step 5): `src/renderer/src/engine/rules.test.ts`, `src/renderer/src/state/gameReducer.test.ts`

**Interfaces:**
- Consumes: `Card`, `Rank`, `Suit` from `@shared/types` (already imported in `shoe.ts`).
- Produces: `export interface BurnInfo { indicatorCard: Card; cardsBurned: number }`; `export function burnCardValue(rank: Rank): number`; `Shoe` gains a required `burn: BurnInfo` field — consumed by Task 2's `Table.tsx`.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/renderer/src/engine/shoe.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { burnCardValue, createShoe, drawCard, isPastCutCard, type Shoe } from './shoe'

describe('createShoe', () => {
  it('builds an 8-deck shoe of 416 cards', () => {
    const shoe = createShoe()
    expect(shoe.cards).toHaveLength(416)
  })

  it('places the cut card 14 from the end, unaffected by the burn amount', () => {
    const shoe = createShoe()
    expect(shoe.cutIndex).toBe(416 - 14)
  })

  it('contains exactly 32 of each rank regardless of shuffle order', () => {
    const shoe = createShoe(() => 0.5)
    const nines = shoe.cards.filter((c) => c.rank === '9')
    expect(nines).toHaveLength(32)
  })

  it('uses the provided random function for shuffling', () => {
    const shoeA = createShoe(() => 0)
    const shoeB = createShoe(() => 0)
    expect(shoeA.cards).toEqual(shoeB.cards)
  })

  it('sets the indicator to the top card of the shuffled deck', () => {
    const shoe = createShoe()
    expect(shoe.burn.indicatorCard).toEqual(shoe.cards[0])
  })

  it('burns the indicator card plus that many more cards, and starts drawIndex past them', () => {
    const shoe = createShoe()
    const expectedBurned = burnCardValue(shoe.burn.indicatorCard.rank) + 1
    expect(shoe.burn.cardsBurned).toBe(expectedBurned)
    expect(shoe.drawIndex).toBe(expectedBurned)
  })
})

describe('burnCardValue', () => {
  it('is 1 for an Ace', () => {
    expect(burnCardValue('A')).toBe(1)
  })

  it('is the pip value for numbered cards 2-9', () => {
    expect(burnCardValue('2')).toBe(2)
    expect(burnCardValue('6')).toBe(6)
    expect(burnCardValue('9')).toBe(9)
  })

  it('is 10 for a numeral-10 card', () => {
    expect(burnCardValue('10')).toBe(10)
  })

  it('is 10 for face cards', () => {
    expect(burnCardValue('J')).toBe(10)
    expect(burnCardValue('Q')).toBe(10)
    expect(burnCardValue('K')).toBe(10)
  })
})

describe('drawCard', () => {
  it('returns the next card and an advanced, unmutated-original shoe', () => {
    const shoe: Shoe = {
      cards: [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' }
      ],
      drawIndex: 0,
      cutIndex: 2,
      burn: { indicatorCard: { rank: 'A', suit: 'spades' }, cardsBurned: 0 }
    }
    const [card, nextShoe] = drawCard(shoe)
    expect(card).toEqual({ rank: 'A', suit: 'spades' })
    expect(nextShoe.drawIndex).toBe(1)
    expect(shoe.drawIndex).toBe(0) // original untouched
  })

  it('throws when the shoe is exhausted', () => {
    const shoe: Shoe = {
      cards: [{ rank: 'A', suit: 'spades' }],
      drawIndex: 1,
      cutIndex: 1,
      burn: { indicatorCard: { rank: 'A', suit: 'spades' }, cardsBurned: 0 }
    }
    expect(() => drawCard(shoe)).toThrow('Shoe is empty')
  })
})

describe('isPastCutCard', () => {
  it('is false before the cut card and true at/after it', () => {
    const shoe: Shoe = {
      cards: [],
      drawIndex: 3,
      cutIndex: 4,
      burn: { indicatorCard: { rank: '2', suit: 'clubs' }, cardsBurned: 0 }
    }
    expect(isPastCutCard(shoe)).toBe(false)
    expect(isPastCutCard({ ...shoe, drawIndex: 4 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/engine/shoe.test.ts`
Expected: FAIL — `burnCardValue` is not exported from `./shoe`, and `shoe.burn` is `undefined`.

- [ ] **Step 3: Implement the burn logic**

Replace the full contents of `src/renderer/src/engine/shoe.ts` with:

```ts
import type { Card, Rank, Suit } from '@shared/types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const DECK_COUNT = 8
const CUT_CARD_FROM_END = 14

export interface BurnInfo {
  indicatorCard: Card
  cardsBurned: number
}

export interface Shoe {
  cards: Card[]
  drawIndex: number
  cutIndex: number
  burn: BurnInfo
}

export function burnCardValue(rank: Rank): number {
  if (rank === 'A') return 1
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return parseInt(rank, 10)
}

export function createShoe(randomFn: () => number = Math.random): Shoe {
  const cards: Card[] = []
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank })
      }
    }
  }
  shuffle(cards, randomFn)

  const indicatorCard = cards[0]
  const cardsBurned = burnCardValue(indicatorCard.rank) + 1

  return {
    cards,
    drawIndex: cardsBurned,
    cutIndex: cards.length - CUT_CARD_FROM_END,
    burn: { indicatorCard, cardsBurned }
  }
}

function shuffle(cards: Card[], randomFn: () => number): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
}

export function drawCard(shoe: Shoe): [Card, Shoe] {
  if (shoe.drawIndex >= shoe.cards.length) {
    throw new Error('Shoe is empty')
  }
  const card = shoe.cards[shoe.drawIndex]
  const nextShoe: Shoe = { ...shoe, drawIndex: shoe.drawIndex + 1 }
  return [card, nextShoe]
}

export function isPastCutCard(shoe: Shoe): boolean {
  return shoe.drawIndex >= shoe.cutIndex
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/engine/shoe.test.ts`
Expected: PASS (all `createShoe`, `burnCardValue`, `drawCard`, `isPastCutCard` tests green).

- [ ] **Step 5: Repair Shoe-typed test fixtures elsewhere**

`Shoe` now requires a `burn` field, and a freshly reshuffled shoe no longer starts at `drawIndex: 0`. Two other test files construct `Shoe` objects by hand and need updating.

In `src/renderer/src/engine/rules.test.ts`, find:

```ts
function makeShoe(cards: Card[]): Shoe {
  return { cards, drawIndex: 0, cutIndex: cards.length }
}
```

Replace with:

```ts
function makeShoe(cards: Card[]): Shoe {
  return {
    cards,
    drawIndex: 0,
    cutIndex: cards.length,
    burn: { indicatorCard: cards[0], cardsBurned: 0 }
  }
}
```

In `src/renderer/src/state/gameReducer.test.ts`, find:

```ts
function makeShoe(cards: Card[], cutIndex = cards.length): Shoe {
  return { cards, drawIndex: 0, cutIndex }
}
```

Replace with:

```ts
function makeShoe(cards: Card[], cutIndex = cards.length): Shoe {
  return {
    cards,
    drawIndex: 0,
    cutIndex,
    burn: { indicatorCard: cards[0], cardsBurned: 0 }
  }
}
```

Still in `src/renderer/src/state/gameReducer.test.ts`, find the reshuffle test:

```ts
  it('NEW_HAND reshuffles and resets shoeHistory once the cut card is passed', () => {
    const state = stateWithShoe({
      bankroll: 900,
      bets: { player: 100, banker: 0, tie: 0 },
      shoe: makeShoe(NATURAL_PLAYER_WIN_CARDS, 4)
    })
    const dealt = gameReducer(state, { type: 'DEAL' })
    expect(dealt.shoe.drawIndex).toBe(4)
    const next = gameReducer(dealt, { type: 'NEW_HAND' })
    expect(next.shoe.cards).toHaveLength(416)
    expect(next.shoe.drawIndex).toBe(0)
    expect(next.shoeHistory).toHaveLength(0)
    expect(next.sessionHistory).toHaveLength(1)
  })
```

Replace with:

```ts
  it('NEW_HAND reshuffles and resets shoeHistory once the cut card is passed', () => {
    const state = stateWithShoe({
      bankroll: 900,
      bets: { player: 100, banker: 0, tie: 0 },
      shoe: makeShoe(NATURAL_PLAYER_WIN_CARDS, 4)
    })
    const dealt = gameReducer(state, { type: 'DEAL' })
    expect(dealt.shoe.drawIndex).toBe(4)
    const next = gameReducer(dealt, { type: 'NEW_HAND' })
    expect(next.shoe.cards).toHaveLength(416)
    // A freshly reshuffled shoe burns the indicator card plus its value in
    // additional cards, so drawIndex starts past 0 rather than at it.
    expect(next.shoe.drawIndex).toBe(next.shoe.burn.cardsBurned)
    expect(next.shoe.drawIndex).toBeGreaterThan(0)
    expect(next.shoeHistory).toHaveLength(0)
    expect(next.sessionHistory).toHaveLength(1)
  })
```

- [ ] **Step 6: Run the full test suite to verify no regressions**

Run: `npx vitest run`
Expected: PASS — every test file green, including `rules.test.ts`, `gameReducer.test.ts`, and `simulate.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/engine/shoe.ts src/renderer/src/engine/shoe.test.ts src/renderer/src/engine/rules.test.ts src/renderer/src/state/gameReducer.test.ts
git commit -m "feat: burn cards at the start of every shoe like a real casino"
```

---

### Task 2: Show the burn card and count on the Play tab

**Files:**
- Modify: `src/renderer/src/components/Table.tsx`
- Modify: `src/renderer/src/components/Table.css`
- Test: `src/renderer/src/components/Table.test.tsx`

**Interfaces:**
- Consumes: `state.shoe.burn: BurnInfo` (from Task 1) via `useGame()`; `PlayingCard` component from `./Card` (`src/renderer/src/components/Card.tsx`, already exports `PlayingCard({ card: Card })`).
- Produces: nothing consumed elsewhere — this is the UI leaf.

Note on test determinism: `GameProvider` (`src/renderer/src/state/GameContext.tsx`) always builds its initial shoe with the real `Math.random`, so `Table.test.tsx` cannot pin down which exact card gets burned. The new test below asserts the rendered structure and a valid count range (2–11, matching `burnCardValue` returning 1–10 plus the indicator) rather than one specific card — that's the strongest assertion possible without adding seed injection to `GameProvider`, which is out of scope for this feature.

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe('Table', ...)` block in `src/renderer/src/components/Table.test.tsx` (after the last existing test, before the closing `})`):

```tsx
  it('shows the burn card indicator and a plausible burn count when a new shoe starts', async () => {
    await renderTable()
    const status = screen.getByTestId('shoe-status')
    expect(status.querySelector('.playing-card')).not.toBeNull()
    const match = status.textContent?.match(/Burn card → (\d+) cards burned/)
    expect(match).not.toBeNull()
    const burnedCount = Number(match?.[1])
    expect(burnedCount).toBeGreaterThanOrEqual(2)
    expect(burnedCount).toBeLessThanOrEqual(11)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/Table.test.tsx`
Expected: FAIL — no element with `data-testid="shoe-status"` exists yet.

- [ ] **Step 3: Add the PlayingCard import and shoe-status markup to Table.tsx**

In `src/renderer/src/components/Table.tsx`, find the import block:

```tsx
import { useEffect, useState } from 'react'
import type { BetSpot } from '@shared/types'
import { useGame } from '../state/GameContext'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'
import { ChipRack } from './ChipRack'
import { Hand } from './Hand'
import { playChipSound, playDealSound, playWinSound, playLoseSound } from '../sounds/soundManager'
import './Table.css'
```

Replace with:

```tsx
import { useEffect, useState } from 'react'
import type { BetSpot } from '@shared/types'
import { useGame } from '../state/GameContext'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'
import { ChipRack } from './ChipRack'
import { Hand } from './Hand'
import { PlayingCard } from './Card'
import { playChipSound, playDealSound, playWinSound, playLoseSound } from '../sounds/soundManager'
import './Table.css'
```

Then find:

```tsx
  return (
    <div className="table" data-testid="table">
      <div className="table__hands">
```

Replace with:

```tsx
  return (
    <div className="table" data-testid="table">
      <div className="table__shoe-status" data-testid="shoe-status">
        <PlayingCard card={state.shoe.burn.indicatorCard} />
        <span>Burn card → {state.shoe.burn.cardsBurned} cards burned</span>
      </div>
      <div className="table__hands">
```

- [ ] **Step 4: Add the shoe-status styling**

In `src/renderer/src/components/Table.css`, append:

```css
.table__shoe-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 0.85rem;
  opacity: 0.85;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/components/Table.test.tsx`
Expected: PASS (all `Table` tests green, including the new burn-status test).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/Table.tsx src/renderer/src/components/Table.css src/renderer/src/components/Table.test.tsx
git commit -m "feat: show the burn card and count on the Play tab"
```
