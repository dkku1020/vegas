import { describe, it, expect } from 'vitest'
import { createShoe, drawCard, isPastCutCard, type Shoe } from './shoe'

describe('createShoe', () => {
  it('builds an 8-deck shoe of 416 cards', () => {
    const shoe = createShoe()
    expect(shoe.cards).toHaveLength(416)
    expect(shoe.drawIndex).toBe(0)
  })

  it('places the cut card 14 from the end', () => {
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
})

describe('drawCard', () => {
  it('returns the next card and an advanced, unmutated-original shoe', () => {
    const shoe: Shoe = {
      cards: [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' }
      ],
      drawIndex: 0,
      cutIndex: 2
    }
    const [card, nextShoe] = drawCard(shoe)
    expect(card).toEqual({ rank: 'A', suit: 'spades' })
    expect(nextShoe.drawIndex).toBe(1)
    expect(shoe.drawIndex).toBe(0) // original untouched
  })

  it('throws when the shoe is exhausted', () => {
    const shoe: Shoe = { cards: [{ rank: 'A', suit: 'spades' }], drawIndex: 1, cutIndex: 1 }
    expect(() => drawCard(shoe)).toThrow('Shoe is empty')
  })
})

describe('isPastCutCard', () => {
  it('is false before the cut card and true at/after it', () => {
    const shoe: Shoe = { cards: [], drawIndex: 3, cutIndex: 4 }
    expect(isPastCutCard(shoe)).toBe(false)
    expect(isPastCutCard({ ...shoe, drawIndex: 4 })).toBe(true)
  })
})
