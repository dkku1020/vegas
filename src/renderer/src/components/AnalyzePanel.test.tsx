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
})
