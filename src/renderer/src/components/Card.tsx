import type { Card as CardType } from '@shared/types'
import './Card.css'

const SUIT_SYMBOLS: Record<CardType['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
}

const RED_SUITS = new Set<CardType['suit']>(['hearts', 'diamonds'])

interface PlayingCardProps {
  card: CardType
}

export function PlayingCard({ card }: PlayingCardProps) {
  const isRed = RED_SUITS.has(card.suit)
  return (
    <div className={`playing-card${isRed ? ' playing-card--red' : ' playing-card--black'}`}>
      <span className="playing-card__rank">{card.rank}</span>
      <span className="playing-card__suit">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  )
}
