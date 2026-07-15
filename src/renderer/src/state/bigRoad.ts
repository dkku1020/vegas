import type { HandHistoryEntry } from '@shared/types'

export interface BigRoadCell {
  outcome: 'player' | 'banker'
  tieCount: number
}

export interface BigRoadPosition {
  col: number
  row: number
}

export const ROWS = 6

interface BigRoadComputation {
  grid: (BigRoadCell | null)[][]
  positions: (BigRoadPosition | null)[]
}

function computeBigRoad(history: HandHistoryEntry[]): BigRoadComputation {
  const grid: (BigRoadCell | null)[][] = []
  const positions: (BigRoadPosition | null)[] = []
  let col = -1
  let row = 0
  let lastOutcome: 'player' | 'banker' | null = null
  let posCol = -1
  let posRow = 0
  let lastOutcomeForPositions: 'player' | 'banker' | null = null

  const ensureColumn = (c: number): void => {
    while (grid.length <= c) grid.push(new Array(ROWS).fill(null))
  }

  for (const entryItem of history) {
    if (entryItem.outcome === 'tie') {
      if (col >= 0) {
        const cell = grid[col][row]
        if (cell) cell.tieCount += 1
      }
      positions.push(null)
      lastOutcomeForPositions = null
      continue
    }

    const outcome = entryItem.outcome

    // Grid logic
    if (lastOutcome === null) {
      col = 0
      row = 0
      ensureColumn(col)
    } else if (outcome === lastOutcome) {
      if (row + 1 < ROWS) {
        row += 1
      } else {
        col += 1
        ensureColumn(col)
      }
    } else {
      col += 1
      row = 0
      ensureColumn(col)
    }

    grid[col][row] = { outcome, tieCount: 0 }
    lastOutcome = outcome

    // Positions logic: ties act as column breaks
    if (lastOutcomeForPositions === null) {
      if (posCol < 0) {
        // First outcome
        posCol = 0
        posRow = 0
      } else {
        // After a tie, treat as a new column
        posCol += 1
        posRow = 0
      }
    } else if (outcome === lastOutcomeForPositions) {
      // Same outcome, continue the streak
      if (posRow + 1 < ROWS) {
        posRow += 1
      } else {
        // Dragon tail: overflow to next column at same row
        posCol += 1
      }
    } else {
      // Different outcome, new column
      posCol += 1
      posRow = 0
    }

    positions.push({ col: posCol, row: posRow })
    lastOutcomeForPositions = outcome
  }

  return { grid, positions }
}

export function buildBigRoad(history: HandHistoryEntry[]): (BigRoadCell | null)[][] {
  return computeBigRoad(history).grid
}

export function getBigRoadPositions(history: HandHistoryEntry[]): (BigRoadPosition | null)[] {
  return computeBigRoad(history).positions
}
