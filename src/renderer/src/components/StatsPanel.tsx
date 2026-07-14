import type { HandHistoryEntry } from '@shared/types'
import { computeStats } from '../state/stats'
import './StatsPanel.css'

interface StatsPanelProps {
  history: HandHistoryEntry[]
}

export function StatsPanel({ history }: StatsPanelProps) {
  const stats = computeStats(history)
  return (
    <div className="stats-panel" data-testid="stats-panel">
      <div>Hands played: {stats.handsPlayed}</div>
      <div>Player wins: {stats.playerWins}</div>
      <div>Banker wins: {stats.bankerWins}</div>
      <div>Ties: {stats.ties}</div>
      <div>Win rate: {(stats.winRate * 100).toFixed(0)}%</div>
      <div>Net profit: ${stats.netProfit.toFixed(2)}</div>
      <div>Biggest win: ${stats.biggestWin.toFixed(2)}</div>
      <div>Biggest loss: ${stats.biggestLoss.toFixed(2)}</div>
    </div>
  )
}
