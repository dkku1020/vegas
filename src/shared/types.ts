export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  suit: Suit
  rank: Rank
}

export type BetSpot = 'player' | 'banker' | 'tie'

export interface Bets {
  player: number
  banker: number
  tie: number
}

export type Outcome = 'player' | 'banker' | 'tie'

export interface DealResult {
  playerCards: Card[]
  bankerCards: Card[]
  playerTotal: number
  bankerTotal: number
  outcome: Outcome
}

export interface Settlement {
  bets: Bets
  outcome: Outcome
  payouts: Bets
  netChange: number
}

export interface HandHistoryEntry {
  outcome: Outcome
  playerTotal: number
  bankerTotal: number
  netChange: number
}

export interface SaveData {
  bankroll: number
}
