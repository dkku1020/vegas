import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode
} from 'react'
import { gameReducer, createInitialState, type GameState, type GameAction } from './gameReducer'

const STARTING_BANKROLL = 1000

interface GameContextValue {
  state: GameState
  dispatch: Dispatch<GameAction>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialState(STARTING_BANKROLL)
  )
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.loadBankroll().then((bankroll) => {
      if (!cancelled) {
        dispatch({ type: 'SET_BANKROLL', amount: bankroll })
        setHasLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasLoaded) return
    window.electronAPI.saveBankroll(state.bankroll)
  }, [state.bankroll, hasLoaded])

  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within a GameProvider')
  return ctx
}
