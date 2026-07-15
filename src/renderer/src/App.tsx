import { useState } from 'react'
import type { HandHistoryEntry } from '@shared/types'
import { GameProvider, useGame } from './state/GameContext'
import { TitleBarOverlay } from './components/TitleBarOverlay'
import { Table } from './components/Table'
import { BigRoad } from './components/BigRoad'
import { StatsPanel } from './components/StatsPanel'
import { RebuyDialog } from './components/RebuyDialog'
import { SimulatePanel } from './components/SimulatePanel'
import { AnalyzePanel } from './components/AnalyzePanel'
import { TABLE_MIN_BET } from './state/gameReducer'
import './App.css'

type AppMode = 'play' | 'simulate' | 'analyze'

interface PlayScreenProps {
  onAnalyze: (history: HandHistoryEntry[]) => void
}

function PlayScreen({ onAnalyze }: PlayScreenProps) {
  const { state, dispatch } = useGame()
  const isBust = state.bankroll < TABLE_MIN_BET && state.phase === 'betting'

  return (
    <>
      <div className="app__layout">
        <div className="app__board-row">
          <BigRoad history={state.shoeHistory} />
        </div>
        <div className="app__table-row">
          <Table />
          <div className="app__stats-row">
            <StatsPanel history={state.sessionHistory} />
            {state.shoeHistory.length > 0 && (
              <button type="button" onClick={() => onAnalyze(state.shoeHistory)}>
                Analyze Big Road
              </button>
            )}
          </div>
        </div>
      </div>
      {isBust && (
        <div className="app__rebuy-overlay">
          <RebuyDialog onAddFunds={(amount) => dispatch({ type: 'ADD_FUNDS', amount })} />
        </div>
      )}
    </>
  )
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('play')
  const [analyzedHistory, setAnalyzedHistory] = useState<HandHistoryEntry[] | null>(null)

  function handleAnalyze(history: HandHistoryEntry[]): void {
    setAnalyzedHistory([...history])
    setMode('analyze')
  }

  return (
    <GameProvider>
      <div className="app">
        <TitleBarOverlay />
        <div className="app__mode-toggle">
          <button type="button" aria-pressed={mode === 'play'} onClick={() => setMode('play')}>
            Play
          </button>
          <button
            type="button"
            aria-pressed={mode === 'simulate'}
            onClick={() => setMode('simulate')}
          >
            Simulate
          </button>
          <button
            type="button"
            aria-pressed={mode === 'analyze'}
            onClick={() => setMode('analyze')}
          >
            Analyze
          </button>
        </div>
        {mode === 'play' && <PlayScreen onAnalyze={handleAnalyze} />}
        {mode === 'simulate' && <SimulatePanel />}
        {mode === 'analyze' && <AnalyzePanel history={analyzedHistory} />}
      </div>
    </GameProvider>
  )
}
