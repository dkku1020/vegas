// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { HandHistoryEntry } from '@shared/types'
import { StatsPanel } from './StatsPanel'

describe('StatsPanel', () => {
  it('renders computed stats from history', () => {
    const history: HandHistoryEntry[] = [
      { outcome: 'player', playerTotal: 9, bankerTotal: 3, netChange: 100 },
      { outcome: 'banker', playerTotal: 2, bankerTotal: 8, netChange: -50 }
    ]
    render(<StatsPanel history={history} />)
    expect(screen.getByTestId('stats-panel')).toBeInTheDocument()
    expect(screen.getByText(/Hands played: 2/)).toBeInTheDocument()
    expect(screen.getByText(/Net profit: \$50\.00/)).toBeInTheDocument()
  })
})
