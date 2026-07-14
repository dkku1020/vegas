import type { Bets } from '@shared/types'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'
import { createShoe, isPastCutCard, type Shoe } from './shoe'
import { playHand } from './rules'
import { computeSettlement } from './payouts'
import type { Strategy, StrategyContext, SimHandRecord } from './strategy'

export interface SimSessionResult {
  finalBankroll: number
  netProfit: number
  busted: boolean
  handsPlayed: number
  shoesCompleted: number
}

export interface SimulateSessionConfig {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  randomFn: () => number
}

function validateBets(bets: Bets, bankroll: number): void {
  for (const amount of [bets.player, bets.banker, bets.tie]) {
    if (amount < 0) {
      throw new Error(`Strategy returned a negative bet: ${amount}`)
    }
    if (amount > TABLE_MAX_BET) {
      throw new Error(
        `Strategy returned a bet of ${amount}, exceeding the table max of ${TABLE_MAX_BET}`
      )
    }
  }
  const total = bets.player + bets.banker + bets.tie
  if (total > bankroll) {
    throw new Error(
      `Strategy returned a total bet of ${total}, exceeding the bankroll of ${bankroll}`
    )
  }
}

export function simulateSession(config: SimulateSessionConfig): SimSessionResult {
  const { strategy, startingBankroll, shoesPerSession, randomFn } = config

  let bankroll = startingBankroll
  let shoe: Shoe = createShoe(randomFn)
  let shoeHistory: SimHandRecord[] = []
  const sessionHistory: SimHandRecord[] = []
  let shoesCompleted = 0
  let busted = false

  while (shoesCompleted < shoesPerSession) {
    if (bankroll < TABLE_MIN_BET) {
      busted = true
      break
    }

    const context: StrategyContext = { bankroll, shoeHistory, sessionHistory }
    const bets = strategy(context)
    validateBets(bets, bankroll)

    bankroll -= bets.player + bets.banker + bets.tie

    const result = playHand(shoe)
    shoe = result.shoe
    const settlement = computeSettlement(bets, result.outcome)
    bankroll += settlement.payouts.player + settlement.payouts.banker + settlement.payouts.tie

    const record: SimHandRecord = { bets, outcome: result.outcome, netChange: settlement.netChange }
    shoeHistory = [...shoeHistory, record]
    sessionHistory.push(record)

    if (isPastCutCard(shoe)) {
      shoe = createShoe(randomFn)
      shoeHistory = []
      shoesCompleted += 1
    }
  }

  return {
    finalBankroll: bankroll,
    netProfit: bankroll - startingBankroll,
    busted,
    handsPlayed: sessionHistory.length,
    shoesCompleted
  }
}
