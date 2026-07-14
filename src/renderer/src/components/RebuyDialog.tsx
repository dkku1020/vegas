import { useState } from 'react'
import './RebuyDialog.css'

const STARTING_BANKROLL = 1000

interface RebuyDialogProps {
  onAddFunds: (amount: number) => void
}

export function RebuyDialog({ onAddFunds }: RebuyDialogProps) {
  const [customAmount, setCustomAmount] = useState('')
  const parsedAmount = Number(customAmount)

  function handleCustomSubmit(): void {
    if (parsedAmount > 0) {
      onAddFunds(parsedAmount)
      setCustomAmount('')
    }
  }

  return (
    <div className="rebuy-dialog" role="dialog" aria-label="Rebuy">
      <p>You&apos;re out of chips.</p>
      <button type="button" onClick={() => onAddFunds(STARTING_BANKROLL)}>
        Reset to ${STARTING_BANKROLL}
      </button>
      <div className="rebuy-dialog__custom">
        <input
          type="number"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="Custom amount"
        />
        <button type="button" onClick={handleCustomSubmit} disabled={!(parsedAmount > 0)}>
          Add Funds
        </button>
      </div>
    </div>
  )
}
