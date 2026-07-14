// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hand } from './Hand'

describe('Hand', () => {
  it('renders a card per entry and the running total', () => {
    const { container } = render(
      <Hand
        label="Player"
        cards={[
          { rank: '9', suit: 'spades' },
          { rank: '10', suit: 'hearts' }
        ]}
        total={9}
      />
    )
    expect(screen.getByText('Player')).toBeInTheDocument()
    expect(container.querySelectorAll('.playing-card')).toHaveLength(2)
    expect(container.querySelector('.hand__total')).toHaveTextContent('9')
  })

  it('omits the total element when null', () => {
    const { container } = render(<Hand label="Banker" cards={[]} total={null} />)
    expect(container.querySelector('.hand__total')).toBeNull()
  })
})
