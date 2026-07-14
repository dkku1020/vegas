import type { Card as CardType } from '@shared/types'
import { PlayingCard } from './Card'
import './Hand.css'

interface HandProps {
  label: string
  cards: CardType[]
  total: number | null
}

export function Hand({ label, cards, total }: HandProps) {
  return (
    <div className="hand">
      <div className="hand__label">
        {label}
        {total !== null && <span className="hand__total">{total}</span>}
      </div>
      <div className="hand__cards">
        {cards.map((card, index) => (
          <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} />
        ))}
      </div>
    </div>
  )
}
