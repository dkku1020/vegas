import type { Card, Rank, Suit } from '@shared/types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const DECK_COUNT = 8
const CUT_CARD_FROM_END = 14

export interface BurnInfo {
  indicatorCard: Card
  cardsBurned: number
}

export interface Shoe {
  cards: Card[]
  drawIndex: number
  cutIndex: number
  burn: BurnInfo
}

export function burnCardValue(rank: Rank): number {
  if (rank === 'A') return 1
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return parseInt(rank, 10)
}

export function createShoe(randomFn: () => number = Math.random): Shoe {
  const cards: Card[] = []
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank })
      }
    }
  }
  shuffle(cards, randomFn)

  const indicatorCard = cards[0]
  const cardsBurned = burnCardValue(indicatorCard.rank) + 1

  return {
    cards,
    drawIndex: cardsBurned,
    cutIndex: cards.length - CUT_CARD_FROM_END,
    burn: { indicatorCard, cardsBurned }
  }
}

function shuffle(cards: Card[], randomFn: () => number): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
}

export function drawCard(shoe: Shoe): [Card, Shoe] {
  if (shoe.drawIndex >= shoe.cards.length) {
    throw new Error('Shoe is empty')
  }
  const card = shoe.cards[shoe.drawIndex]
  const nextShoe: Shoe = { ...shoe, drawIndex: shoe.drawIndex + 1 }
  return [card, nextShoe]
}

export function isPastCutCard(shoe: Shoe): boolean {
  return shoe.drawIndex >= shoe.cutIndex
}
