import './Chip.css'

const CHIP_COLORS: Record<number, string> = {
  1: '#f5f5f5',
  5: '#c0392b',
  25: '#1e8449',
  100: '#1c1c1c',
  500: '#7d3c98'
}

interface ChipProps {
  value: number
  selected?: boolean
  onClick?: () => void
}

export function Chip({ value, selected = false, onClick }: ChipProps) {
  const color = CHIP_COLORS[value] ?? '#333'
  return (
    <button
      type="button"
      data-testid={`chip-${value}`}
      className={`chip${selected ? ' chip--selected' : ''}`}
      style={{ backgroundColor: color }}
      onClick={onClick}
      aria-pressed={selected}
    >
      ${value}
    </button>
  )
}
