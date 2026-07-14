// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RebuyDialog } from './RebuyDialog'

describe('RebuyDialog', () => {
  it('resets to the starting bankroll', () => {
    const onAddFunds = vi.fn()
    render(<RebuyDialog onAddFunds={onAddFunds} />)
    screen.getByText('Reset to $1000').click()
    expect(onAddFunds).toHaveBeenCalledWith(1000)
  })

  it('disables Add Funds until a positive custom amount is entered', () => {
    render(<RebuyDialog onAddFunds={() => {}} />)
    const addButton = screen.getByText('Add Funds')
    expect(addButton).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Custom amount'), { target: { value: '250' } })
    expect(addButton).not.toBeDisabled()
  })

  it('calls onAddFunds with the custom amount and clears the input', () => {
    const onAddFunds = vi.fn()
    render(<RebuyDialog onAddFunds={onAddFunds} />)
    fireEvent.change(screen.getByPlaceholderText('Custom amount'), { target: { value: '250' } })
    fireEvent.click(screen.getByText('Add Funds'))
    expect(onAddFunds).toHaveBeenCalledWith(250)
    expect(screen.getByPlaceholderText('Custom amount')).toHaveValue(null)
  })
})
