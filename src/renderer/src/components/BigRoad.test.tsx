// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { HandHistoryEntry } from '@shared/types'
import { BigRoad } from './BigRoad'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('BigRoad', () => {
  it('renders a cell per non-tie outcome', () => {
    const { container } = render(<BigRoad history={[entry('player'), entry('banker')]} />)
    expect(container.querySelectorAll('.big-road__cell--player')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__cell--banker')).toHaveLength(1)
  })

  it('marks a tie on the preceding cell instead of adding a new one', () => {
    const { container } = render(<BigRoad history={[entry('banker'), entry('tie')]} />)
    expect(container.querySelectorAll('.big-road__cell--banker')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__tie')).toHaveLength(1)
  })

  it('renders an empty board with no history', () => {
    const { container } = render(<BigRoad history={[]} />)
    expect(
      container.querySelectorAll('.big-road__cell--player, .big-road__cell--banker')
    ).toHaveLength(0)
  })

  it('always renders a 6x40 grid of cells, even with no history', () => {
    const { container } = render(<BigRoad history={[]} />)
    expect(container.querySelectorAll('.big-road__cell')).toHaveLength(240)
  })

  it('grows past 40 columns instead of clipping data when a shoe runs long', () => {
    const history: HandHistoryEntry[] = Array.from({ length: 41 }, (_, i) =>
      entry(i % 2 === 0 ? 'player' : 'banker')
    )
    const { container } = render(<BigRoad history={history} />)
    expect(container.querySelectorAll('.big-road__cell')).toHaveLength(41 * 6)
    expect(container.querySelectorAll('.big-road__cell--player')).toHaveLength(21)
    expect(container.querySelectorAll('.big-road__cell--banker')).toHaveLength(20)
  })
})
