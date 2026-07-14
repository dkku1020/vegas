// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChipRack, CHIP_VALUES } from './ChipRack'

describe('ChipRack', () => {
  it('renders one chip per denomination', () => {
    render(<ChipRack selectedValue={5} onSelect={() => {}} />)
    CHIP_VALUES.forEach((value) => {
      expect(screen.getByText(`$${value}`)).toBeInTheDocument()
    })
  })

  it('marks the selected chip as pressed', () => {
    render(<ChipRack selectedValue={25} onSelect={() => {}} />)
    expect(screen.getByTestId('chip-25')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('chip-5')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelect with the clicked chip value', () => {
    const onSelect = vi.fn()
    render(<ChipRack selectedValue={5} onSelect={onSelect} />)
    screen.getByTestId('chip-100').click()
    expect(onSelect).toHaveBeenCalledWith(100)
  })
})
