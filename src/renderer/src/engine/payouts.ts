import type { Bets, Outcome, Settlement } from '@shared/types'

const BANKER_COMMISSION = 0.05
const TIE_PROFIT_MULTIPLIER = 8

function roundToCents(amount: number): number {
  // Math.round(amount * 100) / 100 misrounds ~1% of cent-precision amounts
  // because amount * 100 lands just under a .5 boundary due to binary
  // floating-point imprecision (e.g. 0.70 * 1.95 = 1.3649999999999998,
  // not 1.365). Number.EPSILON compensation does not fully fix this; a
  // small fixed epsilon nudges the value across the boundary reliably.
  return Math.round(amount * 100 + 1e-7) / 100
}

export function computeSettlement(bets: Bets, outcome: Outcome): Settlement {
  const payouts: Bets = { player: 0, banker: 0, tie: 0 }

  if (outcome === 'player') {
    payouts.player = bets.player > 0 ? roundToCents(bets.player * 2) : 0
  } else if (outcome === 'banker') {
    payouts.banker =
      bets.banker > 0 ? roundToCents(bets.banker + bets.banker * (1 - BANKER_COMMISSION)) : 0
  } else {
    payouts.player = bets.player
    payouts.banker = bets.banker
    payouts.tie = bets.tie > 0 ? roundToCents(bets.tie * (1 + TIE_PROFIT_MULTIPLIER)) : 0
  }

  const totalWagered = bets.player + bets.banker + bets.tie
  const totalCredited = payouts.player + payouts.banker + payouts.tie
  const netChange = roundToCents(totalCredited - totalWagered)

  return { bets, outcome, payouts, netChange }
}
