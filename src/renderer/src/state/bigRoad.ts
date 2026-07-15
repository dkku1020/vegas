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
      continue
    }

    const outcome = entryItem.outcome

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
    positions.push({ col, row })
  }

  return { grid, positions }
}

export function buildBigRoad(history: HandHistoryEntry[]): (BigRoadCell | null)[][] {
  return computeBigRoad(history).grid
}

export function getBigRoadPositions(history: HandHistoryEntry[]): (BigRoadPosition | null)[] {
  return computeBigRoad(history).positions
}
