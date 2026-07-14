import type { HandHistoryEntry } from '@shared/types'

export interface Stats {
  handsPlayed: number
  playerWins: number
  bankerWins: number
  ties: number
  winRate: number
  netProfit: number
  biggestWin: number
  biggestLoss: number
}

export function computeStats(history: HandHistoryEntry[]): Stats {
  const handsPlayed = history.length
  const playerWins = history.filter((h) => h.outcome === 'player').length
  const bankerWins = history.filter((h) => h.outcome === 'banker').length
  const ties = history.filter((h) => h.outcome === 'tie').length
  const winningHands = history.filter((h) => h.netChange > 0).length
  const winRate = handsPlayed > 0 ? winningHands / handsPlayed : 0
  const netProfit = history.reduce((sum, h) => sum + h.netChange, 0)
  const biggestWin = history.reduce((max, h) => (h.netChange > max ? h.netChange : max), 0)
  const biggestLoss = history.reduce((min, h) => (h.netChange < min ? h.netChange : min), 0)

  return { handsPlayed, playerWins, bankerWins, ties, winRate, netProfit, biggestWin, biggestLoss }
}
