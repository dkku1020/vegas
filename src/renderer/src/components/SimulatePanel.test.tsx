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

  it('shows an error instead of crashing when the Labouchere sequence is invalid', () => {
    render(<SimulatePanel />)
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'labouchere' } })
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Run'))

    expect(screen.getByTestId('simulate-error')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-results')).not.toBeInTheDocument()
  })
})
