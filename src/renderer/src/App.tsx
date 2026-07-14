import { useState } from 'react'
import { GameProvider, useGame } from './state/GameContext'
import { TitleBarOverlay } from './components/TitleBarOverlay'
import { Table } from './components/Table'
import { BigRoad } from './components/BigRoad'
import { StatsPanel } from './components/StatsPanel'
import { RebuyDialog } from './components/RebuyDialog'
import { SimulatePanel } from './components/SimulatePanel'
import { TABLE_MIN_BET } from './state/gameReducer'
import './App.css'

type AppMode = 'play' | 'simulate'

function PlayScreen() {
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
          <StatsPanel history={state.sessionHistory} />
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
        </div>
        {mode === 'play' ? <PlayScreen /> : <SimulatePanel />}
      </div>
    </GameProvider>
  )
}
