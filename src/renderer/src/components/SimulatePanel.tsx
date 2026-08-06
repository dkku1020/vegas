import { useState } from 'react'
import type { BetSpot } from '@shared/types'
import { flatBet, labouchere } from '../engine/strategy'
import { runSimulation, type SimulationResult } from '../engine/simulate'
import './SimulatePanel.css'

const SPOTS: BetSpot[] = ['player', 'banker', 'tie']
const LABOUCHERE_SPOTS: Array<'player' | 'banker' | 'follow' | 'counter'> = [
  'player',
  'banker',
  'follow',
  'counter'
]

type StrategyType = 'flat' | 'labouchere'

function parseSequence(text: string): number[] {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const numbers = parts.map(Number)
  if (numbers.some((n) => !Number.isFinite(n))) {
    throw new Error(`Sequence must be a comma-separated list of numbers, got "${text}"`)
  }
  return numbers
}

function parseSkipAfter(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Skip bet after must be a positive integer, got "${text}"`)
  }
  return value
}

export function SimulatePanel() {
  const [strategyType, setStrategyType] = useState<StrategyType>('flat')
  const [spot, setSpot] = useState<BetSpot>('banker')
  const [amount, setAmount] = useState('10')
  const [labouchereSpot, setLabouchereSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>(
    'banker'
  )
  const [sequence, setSequence] = useState('1,2,3,4')
  const [unit, setUnit] = useState('5')
  const [skipAfter, setSkipAfter] = useState('')
  const [startingBankroll, setStartingBankroll] = useState('1000')
  const [shoesPerSession, setShoesPerSession] = useState('1')
  const [trials, setTrials] = useState('100')
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleRun(): void {
    try {
      const strategy =
        strategyType === 'flat'
          ? flatBet(spot, Number(amount))
          : labouchere(
              labouchereSpot,
              parseSequence(sequence),
              Number(unit),
              labouchereSpot === 'player' || labouchereSpot === 'banker'
                ? parseSkipAfter(skipAfter)
                : undefined
            )
      const next = runSimulation({
        strategy,
        startingBankroll: Number(startingBankroll),
        shoesPerSession: Number(shoesPerSession),
        trials: Number(trials)
      })
      setResult(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.')
      setResult(null)
    }
  }

  return (
    <div className="simulate-panel" data-testid="simulate-panel">
      <div className="simulate-panel__form">
        <label>
          Strategy
          <select
            value={strategyType}
            onChange={(e) => setStrategyType(e.target.value as StrategyType)}
          >
            <option value="flat">Flat Bet</option>
            <option value="labouchere">Labouchere</option>
          </select>
        </label>
        {strategyType === 'flat' ? (
          <>
            <label>
              Spot
              <select value={spot} onChange={(e) => setSpot(e.target.value as BetSpot)}>
                {SPOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label>
              Spot
              <select
                value={labouchereSpot}
                onChange={(e) =>
                  setLabouchereSpot(e.target.value as 'player' | 'banker' | 'follow' | 'counter')
                }
              >
                {LABOUCHERE_SPOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {(labouchereSpot === 'player' || labouchereSpot === 'banker') && (
              <label>
                Skip bet after (losses)
                <input
                  type="text"
                  value={skipAfter}
                  onChange={(e) => setSkipAfter(e.target.value)}
                  placeholder="e.g. 4"
                />
              </label>
            )}
            <label>
              Sequence
              <input type="text" value={sequence} onChange={(e) => setSequence(e.target.value)} />
            </label>
            <label>
              Unit
              <input type="number" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Starting bankroll
          <input
            type="number"
            value={startingBankroll}
            onChange={(e) => setStartingBankroll(e.target.value)}
          />
        </label>
        <label>
          Shoes per session
          <input
            type="number"
            value={shoesPerSession}
            onChange={(e) => setShoesPerSession(e.target.value)}
          />
        </label>
        <label>
          Trials
          <input type="number" value={trials} onChange={(e) => setTrials(e.target.value)} />
        </label>
        <button type="button" onClick={handleRun}>
          Run
        </button>
      </div>
      {error && (
        <div className="simulate-panel__error" data-testid="simulate-error">
          {error}
        </div>
      )}
      {result && (
        <div className="simulate-panel__results" data-testid="simulate-results">
          <div>Trials: {result.summary.trialCount}</div>
          <div>Avg net profit: ${result.summary.avgNetProfit.toFixed(2)}</div>
          <div>Median net profit: ${result.summary.medianNetProfit.toFixed(2)}</div>
          <div>Bust rate: {(result.summary.bustRate * 100).toFixed(0)}%</div>
          <div>Best trial: ${result.summary.bestNetProfit.toFixed(2)}</div>
          <div>Worst trial: ${result.summary.worstNetProfit.toFixed(2)}</div>
          <div>Avg hands played: {result.summary.avgHandsPlayed.toFixed(1)}</div>
        </div>
      )}
    </div>
  )
}
