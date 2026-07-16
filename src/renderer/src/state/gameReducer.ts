import type { Bets, BetSpot, HandHistoryEntry, Settlement } from '@shared/types'
import { createShoe, isPastCutCard, type Shoe } from '../engine/shoe'
import { playHand, type PlayHandResult } from '../engine/rules'
import { computeSettlement } from '../engine/payouts'

export type GamePhase = 'betting' | 'result'

export const TABLE_MIN_BET = 5
export const TABLE_MAX_BET = 500

export interface GameState {
  bankroll: number
  bets: Bets
  shoe: Shoe
  phase: GamePhase
  lastResult: PlayHandResult | null
  lastSettlement: Settlement | null
  lastBets: Bets | null
  shoeHistory: HandHistoryEntry[]
  sessionHistory: HandHistoryEntry[]
}

export type GameAction =
  | { type: 'PLACE_BET'; spot: BetSpot; amount: number }
  | { type: 'CLEAR_BETS' }
  | { type: 'DEAL' }
  | { type: 'FREE_HAND' }
  | { type: 'FINISH_SHOE' }
  | { type: 'REBET' }
  | { type: 'NEW_HAND' }
  | { type: 'ADD_FUNDS'; amount: number }
  | { type: 'SET_BANKROLL'; amount: number }

export function createInitialState(bankroll: number, randomFn?: () => number): GameState {
  return {
    bankroll,
    bets: { player: 0, banker: 0, tie: 0 },
    shoe: createShoe(randomFn),
    phase: 'betting',
    lastResult: null,
    lastSettlement: null,
    lastBets: null,
    shoeHistory: [],
    sessionHistory: []
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PLACE_BET': {
      if (state.phase !== 'betting') return state
      if (action.amount <= 0 || action.amount > state.bankroll) return state
      if (state.bets[action.spot] + action.amount > TABLE_MAX_BET) return state
      return {
        ...state,
        bankroll: state.bankroll - action.amount,
        bets: { ...state.bets, [action.spot]: state.bets[action.spot] + action.amount }
      }
    }
    case 'CLEAR_BETS': {
      if (state.phase !== 'betting') return state
      const totalReturned = state.bets.player + state.bets.banker + state.bets.tie
      return {
        ...state,
        bankroll: state.bankroll + totalReturned,
        bets: { player: 0, banker: 0, tie: 0 }
      }
    }
    case 'DEAL': {
      if (state.phase !== 'betting') return state
      const totalWagered = state.bets.player + state.bets.banker + state.bets.tie
      if (totalWagered <= 0) return state

      const result = playHand(state.shoe)
      const settlement = computeSettlement(state.bets, result.outcome)
      const totalCredited =
        settlement.payouts.player + settlement.payouts.banker + settlement.payouts.tie
      const historyEntry: HandHistoryEntry = {
        outcome: result.outcome,
        playerTotal: result.playerTotal,
        bankerTotal: result.bankerTotal,
        netChange: settlement.netChange
      }

      return {
        ...state,
        bankroll: state.bankroll + totalCredited,
        shoe: result.shoe,
        phase: 'result',
        lastResult: result,
        lastSettlement: settlement,
        lastBets: { ...state.bets },
        shoeHistory: [...state.shoeHistory, historyEntry],
        sessionHistory: [...state.sessionHistory, historyEntry]
      }
    }
    case 'FREE_HAND': {
      if (state.phase !== 'betting') return state
      const refundedBankroll =
        state.bankroll + state.bets.player + state.bets.banker + state.bets.tie
      const zeroBets: Bets = { player: 0, banker: 0, tie: 0 }
      const result = playHand(state.shoe)
      const settlement = computeSettlement(zeroBets, result.outcome)
      const historyEntry: HandHistoryEntry = {
        outcome: result.outcome,
        playerTotal: result.playerTotal,
        bankerTotal: result.bankerTotal,
        netChange: settlement.netChange
      }

      return {
        ...state,
        bankroll: refundedBankroll,
        bets: zeroBets,
        shoe: result.shoe,
        phase: 'result',
        lastResult: result,
        lastSettlement: settlement,
        shoeHistory: [...state.shoeHistory, historyEntry],
        sessionHistory: [...state.sessionHistory, historyEntry]
      }
    }
    case 'FINISH_SHOE': {
      const zeroBets: Bets = { player: 0, banker: 0, tie: 0 }
      let bankroll = state.bankroll
      if (state.phase === 'betting') {
        bankroll += state.bets.player + state.bets.banker + state.bets.tie
      }
      let shoe = state.shoe
      let lastResult = state.lastResult
      let lastSettlement = state.lastSettlement
      const shoeHistory = [...state.shoeHistory]
      const sessionHistory = [...state.sessionHistory]
      while (!isPastCutCard(shoe)) {
        const result = playHand(shoe)
        const settlement = computeSettlement(zeroBets, result.outcome)
        shoe = result.shoe
        lastResult = result
        lastSettlement = settlement
        const historyEntry: HandHistoryEntry = {
          outcome: result.outcome,
          playerTotal: result.playerTotal,
          bankerTotal: result.bankerTotal,
          netChange: settlement.netChange
        }
        shoeHistory.push(historyEntry)
        sessionHistory.push(historyEntry)
      }
      return {
        ...state,
        bankroll,
        bets: zeroBets,
        shoe,
        phase: 'result',
        lastResult,
        lastSettlement,
        shoeHistory,
        sessionHistory
      }
    }
    case 'REBET': {
      if (state.phase !== 'betting') return state
      if (!state.lastBets) return state
      const totalWagered = state.bets.player + state.bets.banker + state.bets.tie
      if (totalWagered > 0) return state
      const rebetTotal = state.lastBets.player + state.lastBets.banker + state.lastBets.tie
      if (rebetTotal > state.bankroll) return state
      return {
        ...state,
        bankroll: state.bankroll - rebetTotal,
        bets: { ...state.lastBets }
      }
    }
    case 'NEW_HAND': {
      if (state.phase !== 'result') return state
      const reshuffle = isPastCutCard(state.shoe)
      return {
        ...state,
        shoe: reshuffle ? createShoe() : state.shoe,
        shoeHistory: reshuffle ? [] : state.shoeHistory,
        bets: { player: 0, banker: 0, tie: 0 },
        phase: 'betting',
        lastResult: null,
        lastSettlement: null
      }
    }
    case 'ADD_FUNDS': {
      if (action.amount <= 0) return state
      return { ...state, bankroll: state.bankroll + action.amount }
    }
    case 'SET_BANKROLL': {
      return { ...state, bankroll: Math.max(0, action.amount) }
    }
    default:
      return state
  }
}
