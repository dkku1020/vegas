import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad } from '../state/bigRoad'
import './BigRoad.css'

interface BigRoadProps {
  history: HandHistoryEntry[]
}

export function BigRoad({ history }: BigRoadProps) {
  const grid = buildBigRoad(history)
  const columnCount = Math.max(grid.length, 1)

  return (
    <div className="big-road" data-testid="big-road">
      {Array.from({ length: columnCount }).map((_, colIndex) => (
        <div className="big-road__column" key={colIndex}>
          {Array.from({ length: 6 }).map((_, rowIndex) => {
            const cell = grid[colIndex]?.[rowIndex] ?? null
            return (
              <div
                key={rowIndex}
                className={`big-road__cell${cell ? ` big-road__cell--${cell.outcome}` : ''}`}
              >
                {cell && cell.tieCount > 0 && <span className="big-road__tie">/</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
