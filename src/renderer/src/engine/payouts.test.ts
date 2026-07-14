import { describe, it, expect } from 'vitest'
import { computeSettlement } from './payouts'

describe('computeSettlement', () => {
  it('pays a player win 1:1, stake included', () => {
    const result = computeSettlement({ player: 100, banker: 0, tie: 0 }, 'player')
    expect(result.payouts).toEqual({ player: 200, banker: 0, tie: 0 })
    expect(result.netChange).toBe(100)
  })

  it('loses a losing banker bet when player wins', () => {
    const result = computeSettlement({ player: 50, banker: 30, tie: 0 }, 'player')
    expect(result.payouts).toEqual({ player: 100, banker: 0, tie: 0 })
    expect(result.netChange).toBe(20) // +100 -50 -30
  })

  it('pays a banker win 1:1 minus 5% commission', () => {
    const result = computeSettlement({ player: 0, banker: 100, tie: 0 }, 'banker')
    expect(result.payouts).toEqual({ player: 0, banker: 195, tie: 0 })
    expect(result.netChange).toBe(95)
  })

  it('rounds commission to the nearest cent', () => {
    const result = computeSettlement({ player: 0, banker: 5, tie: 0 }, 'banker')
    expect(result.payouts.banker).toBe(9.75)
    expect(result.netChange).toBe(4.75)
  })

  it('rounds a $0.70 banker win to $1.37, not $1.36 (floating-point regression)', () => {
    // 0.70 + 0.70 * 0.95 === 1.3649999999999998 in IEEE 754 double precision,
    // which a naive Math.round(x * 100) / 100 misrounds down to 1.36.
    const result = computeSettlement({ player: 0, banker: 0.7, tie: 0 }, 'banker')
    expect(result.payouts.banker).toBe(1.37)
    expect(result.netChange).toBe(0.67)
  })

  it('pays a tie bet 8:1 and pushes player/banker bets', () => {
    const result = computeSettlement({ player: 20, banker: 0, tie: 10 }, 'tie')
    expect(result.payouts).toEqual({ player: 20, banker: 0, tie: 90 })
    expect(result.netChange).toBe(80) // +20 (push) +90 (tie win) -20 -10
  })

  it('pushes both player and banker bets on a tie with no tie bet', () => {
    const result = computeSettlement({ player: 20, banker: 30, tie: 0 }, 'tie')
    expect(result.payouts).toEqual({ player: 20, banker: 30, tie: 0 })
    expect(result.netChange).toBe(0)
  })

  it('loses a tie bet when the outcome is not a tie', () => {
    const result = computeSettlement({ player: 0, banker: 0, tie: 50 }, 'player')
    expect(result.payouts).toEqual({ player: 0, banker: 0, tie: 0 })
    expect(result.netChange).toBe(-50)
  })
})
