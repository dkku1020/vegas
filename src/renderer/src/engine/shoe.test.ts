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
