import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { computeStats } from './stats'

describe('computeStats', () => {
  it('returns all zeros for empty history', () => {
    expect(computeStats([])).toEqual({
      handsPlayed: 0,
      playerWins: 0,
      bankerWins: 0,
      ties: 0,
      winRate: 0,
      netProfit: 0,
      biggestWin: 0,
      biggestLoss: 0
    })
  })

  it('tallies outcomes, win rate, net profit, and biggest win/loss', () => {
    const history: HandHistoryEntry[] = [
      { outcome: 'player', playerTotal: 9, bankerTotal: 3, netChange: 100 },
      { outcome: 'banker', playerTotal: 2, bankerTotal: 8, netChange: -50 },
      { outcome: 'tie', playerTotal: 5, bankerTotal: 5, netChange: 0 },
      { outcome: 'banker', playerTotal: 1, bankerTotal: 6, netChange: 200 }
    ]
    const stats = computeStats(history)
    expect(stats.handsPlayed).toBe(4)
    expect(stats.playerWins).toBe(1)
    expect(stats.bankerWins).toBe(2)
    expect(stats.ties).toBe(1)
    expect(stats.winRate).toBe(0.5) // 2 of 4 hands had netChange > 0
    expect(stats.netProfit).toBe(250)
    expect(stats.biggestWin).toBe(200)
    expect(stats.biggestLoss).toBe(-50)
  })
})
