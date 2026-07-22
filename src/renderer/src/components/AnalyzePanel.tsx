import { useState } from 'react'
import type { HandHistoryEntry } from '@shared/types'
import { analyzeLabouchereCompletions } from '../engine/analyze'
import { BigRoad } from './BigRoad'
import './AnalyzePanel.css'

const LABOUCHERE_SPOTS: Array<'player' | 'banker' | 'follow' | 'counter'> = [
  'player',
  'banker',
  'follow',
  'counter'
]

interface AnalyzePanelProps {
  history: HandHistoryEntry[] | null
}

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

export function AnalyzePanel({ history }: AnalyzePanelProps) {
  const [spot, setSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>('banker')
  const [sequence, setSequence] = useState('1,2,3,4')
  const [unit, setUnit] = useState('5')
  const [completions, setCompletions] = useState<number[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!history) {
    return (
      <div className="analyze-panel" data-testid="analyze-panel">
        <div className="analyze-panel__empty" data-testid="analyze-empty">
          Send a board over from the Play tab first.
        </div>
      </div>
    )
  }

  function handleStartAnalysis(): void {
    try {
      const result = analyzeLabouchereCompletions(
        history as HandHistoryEntry[],
        spot,
        parseSequence(sequence),
        Number(unit)
      )
      setCompletions(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setCompletions(null)
    }
  }

  return (
    <div className="analyze-panel" data-testid="analyze-panel">
      <div className="analyze-panel__form">
        <label>
          Strategy
          <select defaultValue="labouchere">
            <option value="labouchere">Labouchere</option>
          </select>
        </label>
        <label>
          Spot
          <select
            value={spot}
            onChange={(e) =>
              setSpot(e.target.value as 'player' | 'banker' | 'follow' | 'counter')
            }
          >
            {LABOUCHERE_SPOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sequence
          <input type="text" value={sequence} onChange={(e) => setSequence(e.target.value)} />
        </label>
        <label>
          Unit
          <input type="number" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <button type="button" onClick={handleStartAnalysis}>
          Start Analysis
        </button>
      </div>
      {error && (
        <div className="analyze-panel__error" data-testid="analyze-error">
          {error}
        </div>
      )}
      {completions && (
        <div className="analyze-panel__results" data-testid="analyze-results">
          <div>Sequence completed {completions.length} times</div>
          <BigRoad history={history} highlightIndices={new Set(completions)} />
        </div>
      )}
    </div>
  )
}
