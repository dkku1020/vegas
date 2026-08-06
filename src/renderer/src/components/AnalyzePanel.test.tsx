// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { HandHistoryEntry } from '@shared/types'
import { AnalyzePanel } from './AnalyzePanel'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('AnalyzePanel', () => {
  it('shows an empty state when no board has been sent yet', () => {
    render(<AnalyzePanel history={null} />)
    expect(screen.getByTestId('analyze-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })

  it('renders the config form with no results until Start Analysis is clicked', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    expect(screen.getByTestId('analyze-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })

  it('runs an analysis and shows the completion count with a highlighted board', () => {
    const history: HandHistoryEntry[] = [entry('banker')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-results')).toBeInTheDocument()
    expect(screen.getByText('Sequence completed 1 times')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--highlight')).toHaveLength(1)
  })

  it('shows a zero-completion result without treating it as an error', () => {
    const history: HandHistoryEntry[] = [entry('player')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('Sequence completed 0 times')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-error')).not.toBeInTheDocument()
  })

  it('supports follow and counter spot options and runs an analysis with them', () => {
    const history: HandHistoryEntry[] = [entry('banker'), entry('banker')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-results')).toBeInTheDocument()
    expect(screen.getByText('Sequence completed 1 times')).toBeInTheDocument()
  })

  it('shows an error message instead of crashing when the sequence is invalid', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-error')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })

  it('shows the Skip bet after field for a fixed player/banker spot', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('shows the Skip bet after field for follow/counter spots', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('runs an analysis with skip bet after set on a follow spot and shows dimmed cells', () => {
    // Same history/math as the analyze.ts test above: only hand index 2 ends up skipped.
    const history: HandHistoryEntry[] = [entry('banker'), entry('player'), entry('banker')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('1 hands skipped')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(1)
  })

  it('runs an analysis with skip bet after and shows the skipped count with dimmed cells', () => {
    const history: HandHistoryEntry[] = [entry('banker'), entry('banker'), entry('player')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'player' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('1 hands skipped')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(1)
  })

  it('excludes tie hands from the skipped count so it matches the dimmed cells shown', () => {
    const history: HandHistoryEntry[] = [
      entry('banker'),
      entry('banker'),
      entry('tie'),
      entry('banker')
    ]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'player' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('1 hands skipped')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--skipped')).toHaveLength(1)
  })

  it('treats a blank Skip bet after as disabled', () => {
    const history: HandHistoryEntry[] = [entry('banker'), entry('banker'), entry('banker')]
    render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'player' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('0 hands skipped')).toBeInTheDocument()
  })

  it('shows an error when Skip bet after is not a positive integer', () => {
    render(<AnalyzePanel history={[entry('banker')]} />)
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByTestId('analyze-error')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-results')).not.toBeInTheDocument()
  })

  it('shows the highest sequence number reached and marks the peak hand on the board', () => {
    const history: HandHistoryEntry[] = [entry('player')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2,3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('Highest sequence number: 5')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--peak')).toHaveLength(1)
  })

  it('shows the starting sequence max as the peak with no marked hand when it is never exceeded', () => {
    const history: HandHistoryEntry[] = [entry('banker')]
    const { container } = render(<AnalyzePanel history={history} />)
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '3,4' } })
    fireEvent.click(screen.getByText('Start Analysis'))

    expect(screen.getByText('Highest sequence number: 4')).toBeInTheDocument()
    expect(container.querySelectorAll('.big-road__cell--peak')).toHaveLength(0)
  })
})
