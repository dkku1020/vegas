import { GameProvider, useGame } from './state/GameContext'
import { TitleBarOverlay } from './components/TitleBarOverlay'
import { Table } from './components/Table'
import { BigRoad } from './components/BigRoad'
import { StatsPanel } from './components/StatsPanel'
import { RebuyDialog } from './components/RebuyDialog'
import './App.css'

function GameScreen() {
  const { state, dispatch } = useGame()
  const isBust = state.bankroll === 0 && state.phase === 'betting'

  return (
    <div className="app">
      <TitleBarOverlay />
      <div className="app__layout">
        <BigRoad history={state.shoeHistory} />
        <Table />
        <StatsPanel history={state.sessionHistory} />
      </div>
      {isBust && (
        <div className="app__rebuy-overlay">
          <RebuyDialog onAddFunds={(amount) => dispatch({ type: 'ADD_FUNDS', amount })} />
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <GameProvider>
      <GameScreen />
    </GameProvider>
  )
}
