import { Chip } from './Chip'
import './ChipRack.css'

export const CHIP_VALUES = [1, 5, 25, 100, 500] as const

interface ChipRackProps {
  selectedValue: number
  onSelect: (value: number) => void
}

export function ChipRack({ selectedValue, onSelect }: ChipRackProps) {
  return (
    <div className="chip-rack">
      {CHIP_VALUES.map((value) => (
        <Chip
          key={value}
          value={value}
          selected={value === selectedValue}
          onClick={() => onSelect(value)}
        />
      ))}
    </div>
  )
}
