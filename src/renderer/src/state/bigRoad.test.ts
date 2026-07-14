import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad } from './bigRoad'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('buildBigRoad', () => {
  it('returns an empty grid for no history', () => {
    expect(buildBigRoad([])).toEqual([])
  })

  it('places the first outcome at column 0, row 0', () => {
    const grid = buildBigRoad([entry('player')])
    expect(grid[0][0]).toEqual({ outcome: 'player', tieCount: 0 })
  })

  it('continues a streak down the same column', () => {
    const grid = buildBigRoad([entry('banker'), entry('banker'), entry('banker')])
    expect(grid[0][0]?.outcome).toBe('banker')
    expect(grid[0][1]?.outcome).toBe('banker')
    expect(grid[0][2]?.outcome).toBe('banker')
    expect(grid).toHaveLength(1)
  })

  it('starts a new column when the outcome changes', () => {
    const grid = buildBigRoad([entry('player'), entry('banker')])
    expect(grid[0][0]).toEqual({ outcome: 'player', tieCount: 0 })
    expect(grid[1][0]).toEqual({ outcome: 'banker', tieCount: 0 })
  })

  it('marks a tie on the preceding cell instead of adding a new one', () => {
    const grid = buildBigRoad([entry('banker'), entry('tie'), entry('banker')])
    expect(grid[0][0]).toEqual({ outcome: 'banker', tieCount: 1 })
    expect(grid[0][1]).toEqual({ outcome: 'banker', tieCount: 0 })
  })

  it('overflows to the next column at the same row after 6 in a streak (dragon tail)', () => {
    const history = Array.from({ length: 7 }, () => entry('banker'))
    const grid = buildBigRoad(history)
    expect(grid[0]).toHaveLength(6)
    expect(grid[0].every((cell) => cell?.outcome === 'banker')).toBe(true)
    expect(grid[1][5]?.outcome).toBe('banker')
    expect(grid[1][0]).toBeNull()
  })
})
