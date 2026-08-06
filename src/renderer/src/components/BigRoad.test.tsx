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

  it('shows no count badge for a single tie', () => {
    const { container } = render(<BigRoad history={[entry('banker'), entry('tie')]} />)
    expect(container.querySelectorAll('.big-road__tie')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__tie-count')).toHaveLength(0)
  })

  it('shows a count badge for consecutive ties on the same cell', () => {
    const { container } = render(
      <BigRoad history={[entry('banker'), entry('tie'), entry('tie'), entry('tie')]} />
    )
    expect(container.querySelectorAll('.big-road__tie')).toHaveLength(1)
    const badge = container.querySelector('.big-road__tie-count')
    expect(badge?.textContent).toBe('3')
  })

  it('highlights the cell for a given history index', () => {
    const { container } = render(
      <BigRoad history={[entry('player'), entry('banker')]} highlightIndices={new Set([1])} />
    )
    const highlighted = container.querySelectorAll('.big-road__cell--highlight')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].classList.contains('big-road__cell--banker')).toBe(true)
  })

  it('highlights nothing when highlightIndices is omitted', () => {
    const { container } = render(<BigRoad history={[entry('player')]} />)
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(0)
  })

  it('highlights every matching index, including across multiple columns', () => {
    const { container } = render(
      <BigRoad
        history={[entry('player'), entry('banker'), entry('player')]}
        highlightIndices={new Set([0, 2])}
      />
    )
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(2)
  })

  it('dims the cell for a given skipped history index', () => {
    const { container } = render(
      <BigRoad history={[entry('player'), entry('banker')]} skippedIndices={new Set([1])} />
    )
    const skipped = container.querySelectorAll('.big-road__cell--skipped')
    expect(skipped).toHaveLength(1)
    expect(skipped[0].classList.contains('big-road__cell--banker')).toBe(true)
  })

  it('dims nothing when skippedIndices is omitted', () => {
    const { container } = render(<BigRoad history={[entry('player')]} />)
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(0)
  })

  it('dims every matching index independently of highlighted cells', () => {
    const { container } = render(
      <BigRoad
        history={[entry('player'), entry('banker'), entry('player')]}
        highlightIndices={new Set([0])}
        skippedIndices={new Set([1, 2])}
      />
    )
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(2)
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(1)
  })
})
