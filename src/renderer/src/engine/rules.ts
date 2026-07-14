import type { Card, DealResult, Rank } from '@shared/types'
import { drawCard, type Shoe } from './shoe'

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 1
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0
  return parseInt(rank, 10)
}

export function handTotal(cards: Card[]): number {
  const sum = cards.reduce((acc, c) => acc + cardValue(c.rank), 0)
  return sum % 10
}

export function isNatural(total: number): boolean {
  return total === 8 || total === 9
}

export function playerShouldDraw(playerTotal: number): boolean {
  return playerTotal <= 5
}

export function bankerShouldDraw(bankerTotal: number, playerThirdCardValue: number | null): boolean {
  if (playerThirdCardValue === null) {
    return bankerTotal <= 5
  }
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true
    case 3:
      return playerThirdCardValue !== 8
    case 4:
      return playerThirdCardValue >= 2 && playerThirdCardValue <= 7
    case 5:
      return playerThirdCardValue >= 4 && playerThirdCardValue <= 7
    case 6:
      return playerThirdCardValue === 6 || playerThirdCardValue === 7
    default:
      return false
  }
}

export interface PlayHandResult extends DealResult {
  shoe: Shoe
}

export function playHand(initialShoe: Shoe): PlayHandResult {
  let shoe = initialShoe
  const draw = (): Card => {
    const [card, nextShoe] = drawCard(shoe)
    shoe = nextShoe
    return card
  }

  const playerCards: Card[] = [draw()]
  const bankerCards: Card[] = [draw()]
  playerCards.push(draw())
  bankerCards.push(draw())

  let playerTotal = handTotal(playerCards)
  let bankerTotal = handTotal(bankerCards)

  if (!isNatural(playerTotal) && !isNatural(bankerTotal)) {
    let playerThirdCardValue: number | null = null

    if (playerShouldDraw(playerTotal)) {
      const thirdCard = draw()
      playerCards.push(thirdCard)
      playerThirdCardValue = cardValue(thirdCard.rank)
      playerTotal = handTotal(playerCards)
    }

    if (bankerShouldDraw(bankerTotal, playerThirdCardValue)) {
      bankerCards.push(draw())
      bankerTotal = handTotal(bankerCards)
    }
  }

  const outcome = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie'

  return { playerCards, bankerCards, playerTotal, bankerTotal, outcome, shoe }
}
