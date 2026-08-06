import type { Bets, HandHistoryEntry } from '@shared/types'
import {
  labouchere,
  deriveLabouchereSequence,
  type LabouchereSpotMode,
  type SimHandRecord
} from './strategy'
import { computeSettlement } from './payouts'

export interface AnalyzeLabouchereResult {
  completions: number[]
  skipped: number[]
}

export function analyzeLabouchereCompletions(
  history: HandHistoryEntry[],
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number,
  skipAfter?: number
): AnalyzeLabouchereResult {
  const strategy = labouchere(spotMode, sequence, unit, skipAfter)
  const initialSequence = [...sequence]

  const completions: number[] = []
  const skipped: number[] = []
  const sessionHistory: SimHandRecord[] = []

  for (let i = 0; i < history.length; i++) {
    const bets: Bets = strategy({
      bankroll: Infinity,
      shoeHistory: sessionHistory,
      sessionHistory
    })

    if (
      skipAfter !== undefined &&
      (spotMode === 'player' || spotMode === 'banker') &&
      bets[spotMode] === 0
    ) {
      skipped.push(i)
    }

    const settlement = computeSettlement(bets, history[i].outcome)
    const record: SimHandRecord = {
      bets,
      outcome: history[i].outcome,
      netChange: settlement.netChange
    }
    sessionHistory.push(record)

    const remaining = deriveLabouchereSequence(initialSequence, unit, sessionHistory)
    if (remaining.length === 0) {
      completions.push(i)
    }
  }

  return { completions, skipped }
}
