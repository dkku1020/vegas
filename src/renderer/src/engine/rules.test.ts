// src/renderer/src/engine/rules.test.ts
import { describe, it, expect } from 'vitest'
import type { Card } from '@shared/types'
import type { Shoe } from './shoe'
import {
  bankerShouldDraw,
  cardValue,
  handTotal,
  isNatural,
  playHand,
  playerShouldDraw
} from './rules'

describe('cardValue', () => {
  it('values ace as 1, tens/faces as 0, others as face value', () => {
    expect(cardValue('A')).toBe(1)
    expect(cardValue('10')).toBe(0)
    expect(cardValue('J')).toBe(0)
    expect(cardValue('Q')).toBe(0)
    expect(cardValue('K')).toBe(0)
    expect(cardValue('7')).toBe(7)
  })
})

describe('handTotal', () => {
  it('sums card values mod 10', () => {
    const cards: Card[] = [{ rank: 'K', suit: 'spades' }, { rank: '5', suit: 'hearts' }]
    expect(handTotal(cards)).toBe(5)
  })

  it('wraps totals over 9', () => {
    const cards: Card[] = [{ rank: '9', suit: 'spades' }, { rank: '9', suit: 'hearts' }]
    expect(handTotal(cards)).toBe(8)
  })
})

describe('isNatural', () => {
  it('is true only for 8 or 9', () => {
    expect(isNatural(8)).toBe(true)
    expect(isNatural(9)).toBe(true)
    expect(isNatural(7)).toBe(false)
    expect(isNatural(0)).toBe(false)
  })
})

describe('playerShouldDraw', () => {
  it('draws on 0-5, stands on 6-7', () => {
    expect(playerShouldDraw(0)).toBe(true)
    expect(playerShouldDraw(5)).toBe(true)
    expect(playerShouldDraw(6)).toBe(false)
    expect(playerShouldDraw(7)).toBe(false)
  })
})

describe('bankerShouldDraw', () => {
  it('always draws on 0-2', () => {
    expect(bankerShouldDraw(0, 5)).toBe(true)
    expect(bankerShouldDraw(2, 0)).toBe(true)
  })

  it('on 3, draws unless the player third card was an 8', () => {
    expect(bankerShouldDraw(3, 7)).toBe(true)
    expect(bankerShouldDraw(3, 8)).toBe(false)
  })

  it('on 4, draws only if the player third card was 2-7', () => {
    expect(bankerShouldDraw(4, 2)).toBe(true)
    expect(bankerShouldDraw(4, 7)).toBe(true)
    expect(bankerShouldDraw(4, 1)).toBe(false)
    expect(bankerShouldDraw(4, 8)).toBe(false)
  })

  it('on 5, draws only if the player third card was 4-7', () => {
    expect(bankerShouldDraw(5, 4)).toBe(true)
    expect(bankerShouldDraw(5, 3)).toBe(false)
  })

  it('on 6, draws only if the player third card was 6 or 7', () => {
    expect(bankerShouldDraw(6, 6)).toBe(true)
    expect(bankerShouldDraw(6, 5)).toBe(false)
  })

  it('never draws on 7', () => {
    expect(bankerShouldDraw(7, 9)).toBe(false)
  })

  it('when the player stood (null third card), draws on 0-5', () => {
    expect(bankerShouldDraw(5, null)).toBe(true)
    expect(bankerShouldDraw(6, null)).toBe(false)
  })
})

function makeShoe(cards: Card[]): Shoe {
  return { cards, drawIndex: 0, cutIndex: cards.length }
}

describe('playHand', () => {
  it('stops immediately on a player natural, even with a mediocre banker hand', () => {
    const shoe = makeShoe([
      { rank: '9', suit: 'spades' }, // P1
      { rank: '2', suit: 'spades' }, // B1
      { rank: '10', suit: 'spades' }, // P2 -> player total 9 (natural)
      { rank: '3', suit: 'spades' } // B2 -> banker total 5
    ])
    const result = playHand(shoe)
    expect(result.playerTotal).toBe(9)
    expect(result.bankerTotal).toBe(5)
    expect(result.outcome).toBe('player')
    expect(result.shoe.drawIndex).toBe(4)
  })

  it('ends in a tie when both hands are natural with equal totals', () => {
    const shoe = makeShoe([
      { rank: '9', suit: 'spades' }, // P1
      { rank: '9', suit: 'hearts' }, // B1
      { rank: '10', suit: 'spades' }, // P2 -> player 9
      { rank: '10', suit: 'hearts' } // B2 -> banker 9
    ])
    const result = playHand(shoe)
    expect(result.outcome).toBe('tie')
    expect(result.shoe.drawIndex).toBe(4)
  })

  it('draws a banker third card when the player stood on 6-7', () => {
    const shoe = makeShoe([
      { rank: '6', suit: 'spades' }, // P1
      { rank: '2', suit: 'spades' }, // B1
      { rank: '10', suit: 'spades' }, // P2 -> player total 6, stands
      { rank: '2', suit: 'hearts' }, // B2 -> banker total 4, draws (player stood)
      { rank: '3', suit: 'clubs' } // B3 -> banker total 7
    ])
    const result = playHand(shoe)
    expect(result.playerCards).toHaveLength(2)
    expect(result.playerTotal).toBe(6)
    expect(result.bankerTotal).toBe(7)
    expect(result.outcome).toBe('banker')
    expect(result.shoe.drawIndex).toBe(5)
  })

  it('draws both a player and banker third card per the fixed matrix', () => {
    const shoe = makeShoe([
      { rank: '4', suit: 'spades' }, // P1
      { rank: 'A', suit: 'hearts' }, // B1
      { rank: 'A', suit: 'diamonds' }, // P2 -> player total 5, draws
      { rank: '2', suit: 'clubs' }, // B2 -> banker total 3
      { rank: '5', suit: 'spades' }, // P3 -> player total 0 (5+5=10 mod 10)
      { rank: '9', suit: 'hearts' } // B3 -> banker draws (3rd card 5 != 8) -> total 2
    ])
    const result = playHand(shoe)
    expect(result.playerCards).toHaveLength(3)
    expect(result.bankerCards).toHaveLength(3)
    expect(result.playerTotal).toBe(0)
    expect(result.bankerTotal).toBe(2)
    expect(result.outcome).toBe('banker')
    expect(result.shoe.drawIndex).toBe(6)
  })
})
