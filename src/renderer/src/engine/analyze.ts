import type { Bets, HandHistoryEntry } from '@shared/types'
import { labouchere, deriveLabouchereSequence, type SimHandRecord } from './strategy'
import { computeSettlement } from './payouts'

export function analyzeLabouchereCompletions(
  history: HandHistoryEntry[],
  spot: 'player' | 'banker',
  sequence: number[],
  unit: number
): number[] {
  const strategy = labouchere(spot, sequence, unit)
  const initialSequence = [...sequence]

  const completions: number[] = []
  const sessionHistory: SimHandRecord[] = []

  for (let i = 0; i < history.length; i++) {
    const bets: Bets = strategy({
      bankroll: Infinity,
      shoeHistory: sessionHistory,
      sessionHistory
    })
    const settlement = computeSettlement(bets, history[i].outcome)
    const record: SimHandRecord = {
      bets,
      outcome: history[i].outcome,
      netChange: settlement.netChange
    }
    sessionHistory.push(record)

    const remaining = deriveLabouchereSequence(initialSequence, unit, spot, sessionHistory)
    if (remaining.length === 0) {
      completions.push(i)
    }
  }

  return completions
}
