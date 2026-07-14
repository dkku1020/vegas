import type { HandHistoryEntry } from '@shared/types'

export interface BigRoadCell {
  outcome: 'player' | 'banker'
  tieCount: number
}

export const ROWS = 6

export function buildBigRoad(history: HandHistoryEntry[]): (BigRoadCell | null)[][] {
  const grid: (BigRoadCell | null)[][] = []
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
  }

  return grid
}
