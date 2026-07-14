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
})
