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

function parseSkipAfter(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Skip bet after must be a positive integer, got "${text}"`)
  }
  return value
}

export function AnalyzePanel({ history }: AnalyzePanelProps) {
  const [spot, setSpot] = useState<'player' | 'banker' | 'follow' | 'counter'>('banker')
  const [sequence, setSequence] = useState('1,2,3,4')
  const [unit, setUnit] = useState('5')
  const [skipAfter, setSkipAfter] = useState('')
  const [completions, setCompletions] = useState<number[] | null>(null)
  const [skipped, setSkipped] = useState<number[]>([])
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
      const parsedSkipAfter =
        spot === 'player' || spot === 'banker' ? parseSkipAfter(skipAfter) : undefined
      const result = analyzeLabouchereCompletions(
        history as HandHistoryEntry[],
        spot,
        parseSequence(sequence),
        Number(unit),
        parsedSkipAfter
      )
      setCompletions(result.completions)
      setSkipped(result.skipped)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setCompletions(null)
      setSkipped([])
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
        {(spot === 'player' || spot === 'banker') && (
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
          <div>{skipped.filter((i) => history[i].outcome !== 'tie').length} hands skipped</div>
          <BigRoad
            history={history}
            highlightIndices={new Set(completions)}
            skippedIndices={new Set(skipped)}
          />
        </div>
      )}
    </div>
  )
}
