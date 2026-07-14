// src/renderer/src/components/Table.tsx
import { useEffect, useState } from 'react'
import type { BetSpot } from '@shared/types'
import { useGame } from '../state/GameContext'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'
import { ChipRack } from './ChipRack'
import { Hand } from './Hand'
import { playChipSound, playDealSound, playWinSound, playLoseSound } from '../sounds/soundManager'
import './Table.css'

const SPOT_LABELS: Record<BetSpot, string> = {
  player: 'Player',
  banker: 'Banker',
  tie: 'Tie'
}

const SPOTS: BetSpot[] = ['player', 'banker', 'tie']

export function Table() {
  const { state, dispatch } = useGame()
  const [selectedChip, setSelectedChip] = useState(5)

  const totalWagered = state.bets.player + state.bets.banker + state.bets.tie
  const canBet = state.phase === 'betting'
  const canDeal = canBet && totalWagered >= TABLE_MIN_BET

  useEffect(() => {
    if (state.phase === 'result' && state.lastSettlement) {
      if (state.lastSettlement.netChange > 0) {
        playWinSound()
      } else if (state.lastSettlement.netChange < 0) {
        playLoseSound()
      }
    }
  }, [state.lastSettlement, state.phase])

  function handleBet(spot: BetSpot): void {
    if (!canBet) return
    if (selectedChip > state.bankroll) return
    if (state.bets[spot] + selectedChip > TABLE_MAX_BET) return
    dispatch({ type: 'PLACE_BET', spot, amount: selectedChip })
    playChipSound()
  }

  function handleClear(): void {
    if (state.phase !== 'betting') return
    dispatch({ type: 'CLEAR_BETS' })
  }

  function handleDeal(): void {
    if (!canDeal) return
    dispatch({ type: 'DEAL' })
    playDealSound()
  }

  function handleNewHand(): void {
    dispatch({ type: 'NEW_HAND' })
  }

  return (
    <div className="table" data-testid="table">
      <div className="table__hands">
        <Hand
          label="Player"
          cards={state.lastResult?.playerCards ?? []}
          total={state.lastResult?.playerTotal ?? null}
        />
        <Hand
          label="Banker"
          cards={state.lastResult?.bankerCards ?? []}
          total={state.lastResult?.bankerTotal ?? null}
        />
      </div>

      <div className="table__spots">
        {SPOTS.map((spot) => (
          <button
            key={spot}
            type="button"
            data-testid={`bet-spot-${spot}`}
            className={`table__spot table__spot--${spot}`}
            onClick={() => handleBet(spot)}
            disabled={!canBet}
          >
            <span className="table__spot-label">{SPOT_LABELS[spot]}</span>
            <span className="table__spot-amount">${state.bets[spot]}</span>
          </button>
        ))}
      </div>

      <ChipRack selectedValue={selectedChip} onSelect={setSelectedChip} />

      <div className="table__controls">
        <span className="table__bankroll">Bankroll: ${state.bankroll}</span>
        {state.phase === 'betting' ? (
          <>
            <button type="button" onClick={handleClear} disabled={totalWagered === 0}>
              Clear
            </button>
            <button type="button" onClick={handleDeal} disabled={!canDeal}>
              Deal
            </button>
          </>
        ) : (
          <button type="button" onClick={handleNewHand}>
            Next Hand
          </button>
        )}
      </div>
    </div>
  )
}
