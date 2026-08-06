import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad, getBigRoadPositions, ROWS } from '../state/bigRoad'
import './BigRoad.css'

const MIN_COLUMNS = 40

interface BigRoadProps {
  history: HandHistoryEntry[]
  highlightIndices?: Set<number>
  skippedIndices?: Set<number>
  peakIndex?: number | null
}

export function BigRoad({ history, highlightIndices, skippedIndices, peakIndex }: BigRoadProps) {
  const grid = buildBigRoad(history)
  const columnCount = Math.max(grid.length, MIN_COLUMNS)

  const positions =
    highlightIndices || skippedIndices || peakIndex != null ? getBigRoadPositions(history) : null

  const highlightedCells = new Set<string>()
  if (highlightIndices && positions) {
    for (const index of highlightIndices) {
      const position = positions[index]
      if (position) highlightedCells.add(`${position.col}-${position.row}`)
    }
  }

  const skippedCells = new Set<string>()
  if (skippedIndices && positions) {
    for (const index of skippedIndices) {
      const position = positions[index]
      if (position) skippedCells.add(`${position.col}-${position.row}`)
    }
  }

  let peakCell: string | null = null
  if (peakIndex != null && positions) {
    const position = positions[peakIndex]
    if (position) peakCell = `${position.col}-${position.row}`
  }

  const cells = Array.from({ length: columnCount }, (_, colIndex) =>
    Array.from({ length: ROWS }, (_, rowIndex) => {
      const cell = grid[colIndex]?.[rowIndex] ?? null
      const key = `${colIndex}-${rowIndex}`
      const isHighlighted = highlightedCells.has(key)
      const isSkipped = skippedCells.has(key)
      const isPeak = key === peakCell
      const classNames = [
        'big-road__cell',
        cell ? `big-road__cell--${cell.outcome}` : '',
        isHighlighted ? 'big-road__cell--highlight' : '',
        isSkipped ? 'big-road__cell--skipped' : '',
        isPeak ? 'big-road__cell--peak' : ''
      ]
        .filter(Boolean)
        .join(' ')
      return (
        <div key={key} className={classNames}>
          {cell && (
            <span className="big-road__circle">
              {cell.tieCount > 0 && (
                <>
                  <span className="big-road__tie" />
                  {cell.tieCount > 1 && (
                    <span className="big-road__tie-count">{cell.tieCount}</span>
                  )}
                </>
              )}
            </span>
          )}
        </div>
      )
    })
  ).flat()

  return (
    <div
      className="big-road"
      data-testid="big-road"
      style={{ gridTemplateColumns: `repeat(${columnCount}, 26px)` }}
    >
      {cells}
    </div>
  )
}
