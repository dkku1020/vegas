// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayingCard } from './Card'

describe('PlayingCard', () => {
  it('renders the rank and a red suit symbol for hearts', () => {
    const { container } = render(<PlayingCard card={{ rank: 'K', suit: 'hearts' }} />)
    expect(screen.getByText('K')).toBeInTheDocument()
    expect(screen.getByText('♥')).toBeInTheDocument()
    expect(container.querySelector('.playing-card--red')).not.toBeNull()
  })

  it('renders a black suit symbol for spades', () => {
    const { container } = render(<PlayingCard card={{ rank: '10', suit: 'spades' }} />)
    expect(screen.getByText('♠')).toBeInTheDocument()
    expect(container.querySelector('.playing-card--black')).not.toBeNull()
  })
})
