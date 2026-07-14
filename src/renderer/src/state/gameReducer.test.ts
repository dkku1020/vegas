import { describe, it, expect } from 'vitest'
import type { Card } from '@shared/types'
import type { Shoe } from '../engine/shoe'
import { gameReducer, createInitialState, type GameState } from './gameReducer'

function makeShoe(cards: Card[], cutIndex = cards.length): Shoe {
  return { cards, drawIndex: 0, cutIndex }
}

const NATURAL_PLAYER_WIN_CARDS: Card[] = [
  { rank: '9', suit: 'spades' }, // P1
  { rank: '2', suit: 'spades' }, // B1
  { rank: '10', suit: 'spades' }, // P2 -> player total 9 (natural)
  { rank: '3', suit: 'spades' } // B2 -> banker total 5
]

function stateWithShoe(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState(1000)
  return { ...base, shoe: makeShoe(NATURAL_PLAYER_WIN_CARDS), ...overrides }
}

describe('gameReducer', () => {
  it('PLACE_BET deducts the bankroll and records the bet', () => {
    const state = stateWithShoe()
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 50 })
    expect(next.bankroll).toBe(950)
    expect(next.bets.player).toBe(50)
  })

  it('PLACE_BET is a no-op when the amount exceeds the bankroll', () => {
    const state = stateWithShoe({ bankroll: 10 })
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 50 })
    expect(next).toBe(state)
  })

  it('PLACE_BET is a no-op when stacking would exceed the $500 table max for that spot', () => {
    const state = stateWithShoe({ bankroll: 1000, bets: { player: 400, banker: 0, tie: 0 } })
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 500 })
    expect(next).toBe(state)
    const accepted = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 100 })
    expect(accepted.bets.player).toBe(500)
  })

  it('PLACE_BET is a no-op outside the betting phase', () => {
    const state = stateWithShoe({ phase: 'result' })
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 50 })
    expect(next).toBe(state)
  })

  it('CLEAR_BETS refunds all wagered chips', () => {
    const state = stateWithShoe({ bankroll: 930, bets: { player: 50, banker: 20, tie: 0 } })
    const next = gameReducer(state, { type: 'CLEAR_BETS' })
    expect(next.bankroll).toBe(1000)
    expect(next.bets).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('DEAL is a no-op when no bets are placed', () => {
    const state = stateWithShoe()
    const next = gameReducer(state, { type: 'DEAL' })
    expect(next).toBe(state)
  })

  it('DEAL settles the hand, credits the bankroll, and records history', () => {
    const state = stateWithShoe({ bankroll: 900, bets: { player: 100, banker: 0, tie: 0 } })
    const next = gameReducer(state, { type: 'DEAL' })
    expect(next.phase).toBe('result')
    expect(next.bankroll).toBe(1100)
    expect(next.lastResult?.outcome).toBe('player')
    expect(next.shoeHistory).toHaveLength(1)
    expect(next.sessionHistory).toHaveLength(1)
  })

  it('NEW_HAND returns to betting and clears the current bets', () => {
    const dealt = gameReducer(
      stateWithShoe({
        bankroll: 900,
        bets: { player: 100, banker: 0, tie: 0 },
        // cutIndex set well past the 4 cards this natural-win hand consumes,
        // so this test exercises the "no reshuffle" path (the reshuffle path
        // is covered separately below).
        shoe: makeShoe(NATURAL_PLAYER_WIN_CARDS, 100)
      }),
      { type: 'DEAL' }
    )
    const next = gameReducer(dealt, { type: 'NEW_HAND' })
    expect(next.phase).toBe('betting')
    expect(next.bets).toEqual({ player: 0, banker: 0, tie: 0 })
    expect(next.lastResult).toBeNull()
    expect(next.shoeHistory).toHaveLength(1)
  })

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

  it('ADD_FUNDS increases the bankroll and ignores non-positive amounts', () => {
    const state = stateWithShoe({ bankroll: 0 })
    expect(gameReducer(state, { type: 'ADD_FUNDS', amount: 1000 }).bankroll).toBe(1000)
    expect(gameReducer(state, { type: 'ADD_FUNDS', amount: -5 })).toBe(state)
  })

  it('SET_BANKROLL overwrites the bankroll, clamped at zero', () => {
    const state = stateWithShoe()
    expect(gameReducer(state, { type: 'SET_BANKROLL', amount: 750 }).bankroll).toBe(750)
    expect(gameReducer(state, { type: 'SET_BANKROLL', amount: -20 }).bankroll).toBe(0)
  })
})
