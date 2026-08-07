// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SimulatePanel } from './SimulatePanel'

describe('SimulatePanel', () => {
  it('renders the config form with no results until Run is clicked', () => {
    render(<SimulatePanel />)
    expect(screen.getByTestId('simulate-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })

  it('runs a simulation and displays the summary results', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
    expect(screen.getByText('Avg net profit: $0.00')).toBeInTheDocument()
    expect(screen.getByText('Bust rate: 0%')).toBeInTheDocument()
  })

  it('shows an error message instead of crashing when the simulation config is invalid', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '0' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })

  it('shows Labouchere fields and hides the flat Amount field when Labouchere is selected', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })

    expect(screen.getByLabelText('Sequence')).toBeInTheDocument()
    expect(screen.getByLabelText('Unit')).toBeInTheDocument()
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument()
  })

  it('runs a Labouchere simulation and displays the summary results', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('runs a Labouchere simulation with a follow/counter spot option', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'counter' } })
    expect((screen.getByLabelText('Spot') as HTMLSelectElement).value).toBe('counter')
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('shows an error instead of crashing when the Labouchere sequence is invalid', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })

  it('shows the Skip bet after field for a fixed Labouchere player/banker spot', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('hides the Skip bet after field for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    expect(screen.queryByLabelText('Skip bet after (losses)')).not.toBeInTheDocument()
  })

  it('shows the Skip bet after field for follow/counter spots', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'counter' } })
    expect(screen.getByLabelText('Skip bet after (losses)')).toBeInTheDocument()
  })

  it('runs a Labouchere simulation with skip bet after set on a follow spot', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('runs a Labouchere simulation with skip bet after set', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('shows an error when Skip bet after is not a positive integer', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Skip bet after (losses)'), { target: { value: '-1' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })

  it('hides the peak and final-completion stats for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.queryByText(/Avg peak sequence number/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Highest peak seen/)).not.toBeInTheDocument()
    expect(screen.queryByText(/final sequence completed at hand/i)).not.toBeInTheDocument()
  })

  it('shows peak sequence stats for a Labouchere simulation', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByText(/Avg peak sequence number:/)).toBeInTheDocument()
    expect(screen.getByText(/Highest peak seen:/)).toBeInTheDocument()
  })

  it('shows the final-completion hand stats for a Labouchere simulation', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    // 5 trials of a full shoe with a short [1,2] sequence completes essentially every trial —
    // same statistical-certainty pattern already relied on by the peak-stats test above.
    expect(screen.getByText(/Avg final sequence completed at hand:/)).toBeInTheDocument()
    expect(screen.getByText(/Latest final sequence completed at hand:/)).toBeInTheDocument()
  })

  it('shows the No new sequence after field for Labouchere regardless of spot', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'follow' } })
    expect(screen.getByLabelText('No new sequence after (hands)')).toBeInTheDocument()
  })

  it('hides the No new sequence after field for Flat Bet strategy', () => {
    render(<SimulatePanel />)
    expect(screen.queryByLabelText('No new sequence after (hands)')).not.toBeInTheDocument()
  })

  it('runs a Labouchere simulation with No new sequence after set', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '1,2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('No new sequence after (hands)'), {
      target: { value: '50' }
    })
    fireEvent.change(screen.getByLabelText('Trials'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-results')).toBeInTheDocument()
    expect(screen.getByText('Trials: 5')).toBeInTheDocument()
  })

  it('shows an error when No new sequence after is not a positive integer', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('No new sequence after (hands)'), {
      target: { value: '-1' }
    })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })
})
