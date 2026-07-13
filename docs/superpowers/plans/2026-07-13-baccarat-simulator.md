# Baccarat Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-only Electron + React + TypeScript app that simulates hand-by-hand Punto Banco baccarat with chips, a persistent bankroll, a Big Road scoreboard, and session stats.

**Architecture:** A pure-TypeScript rules engine (shoe, drawing rules, payouts) with zero React/DOM dependency drives a `useReducer`-based game state; React components render that state and dispatch actions. The Electron main process persists only the bankroll dollar amount to a JSON file in `userData`, exposed to the renderer via a typed `contextBridge` API — no other state survives a restart.

**Tech Stack:** TypeScript, React 19, electron-vite 5 (Vite 7 under the hood), Electron 43, Vitest 4 + @testing-library/react for tests, electron-builder 26 for macOS packaging. No state-management library, no animation library, no external audio assets (sounds are synthesized with the Web Audio API).

## Global Constraints

- **Platform:** macOS only. No Windows/Linux support, testing, or packaging.
- **Rules:** Punto Banco. 8-deck shoe (416 cards), cut card 14 cards from the end. Player draws on 0–5. Banker draws per the standard fixed matrix. Player bet pays 1:1. Banker bet pays 1:1 minus 5% commission (net 0.95:1), deducted immediately. Tie bet pays 8:1; Player/Banker bets push on a tie.
- **Bets:** Player, Banker, Tie only. No side bets. Multiple simultaneous bets allowed per hand.
- **Bankroll:** Starting bankroll $1,000. Chip denominations $1, $5, $25, $100, $500. Table min bet $5, max bet $500. Bankroll persists across app restarts via a JSON file in Electron's `userData` dir; shoe state, hand history, and stats do not persist.
- **Interaction:** Click a chip to select it, click a betting spot to stack it there. A "Clear" button empties all bets. No drag-and-drop, no Rebet/Double buttons.
- **Window:** `titleBarStyle: 'hiddenInset'` with traffic lights overlaid on the felt background — no standard title bar.
- **Package versions (verified compatible together on 2026-07-13):** `electron-vite@^5.0.0`, `vite@^7.3.6`, `@vitejs/plugin-react@^5.2.0`, `vitest@^4.1.10`, `jsdom@^29.1.1`, `electron@^43.1.0`, `electron-builder@^26.15.3`, `react@^19.2.7`, `react-dom@^19.2.7`, `typescript@^7.0.2`, `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^6.9.1`. Do not upgrade `@vitejs/plugin-react` past a version that still supports `vite@^7` without checking peer deps first — `@vitejs/plugin-react@6.x` requires `vite@^8` and will break the install.
- **Testing:** TDD for all pure logic (engine, reducer, persistence, stats, big-road). Vitest defaults to `environment: 'node'`; any test that renders a React component must open with `// @vitest-environment jsdom` as its first line.
- **Path alias:** `@shared/*` resolves to `src/shared/*` in every config (electron.vite.config.ts, tsconfig.web.json, vitest.config.ts). Use it for all shared-type imports instead of relative `../../shared` paths.

---

### Task 1: Project scaffold (Electron + Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `.gitignore`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`

**Interfaces:**
- Produces: the `@shared/*` → `src/shared/*` path alias (used by every later task), the `npm run dev|build|test|typecheck` scripts, and a working `electron-vite build` output.

- [ ] **Step 1: Create the directory layout**

```bash
mkdir -p src/main src/preload src/renderer/src src/shared
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "vegas-baccarat",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "dist:mac": "electron-vite build && electron-builder --mac"
  },
  "dependencies": {
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^26.1.1",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.2.0",
    "electron": "^43.1.0",
    "electron-builder": "^26.15.3",
    "electron-vite": "^5.0.0",
    "jsdom": "^29.1.1",
    "typescript": "^7.0.2",
    "vite": "^7.3.6",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: installs succeed (EBADENGINE warnings about Node version are harmless and can be ignored).

- [ ] **Step 4: Write `electron.vite.config.ts`**

```typescript
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 5: Write `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["electron-vite/node", "node"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["electron.vite.config.*", "src/main/**/*", "src/preload/**/*"]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": ["src/renderer/src/**/*", "src/shared/**/*"]
}
```

Note: do NOT add `baseUrl` — TypeScript 7 removed it; `paths` alone is sufficient here.

- [ ] **Step 6: Write `vitest.config.ts` and `vitest.setup.ts`**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts']
  }
})
```

`vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 7: Write `.gitignore`**

```
node_modules
out
dist
.DS_Store
```

- [ ] **Step 8: Write the minimal main/preload/renderer entry points**

`src/main/index.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`:
```typescript
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: (): string => 'pong'
})
```

`src/renderer/index.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Vegas Baccarat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:
```typescript
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

`src/renderer/src/App.tsx`:
```typescript
export default function App() {
  return <div>Vegas Baccarat</div>
}
```

- [ ] **Step 9: Verify everything compiles and builds**

Run: `npm run typecheck`
Expected: no output, exit code 0.

Run: `npm test`
Expected: `No test files found` (there are none yet) — this is fine at this step.

Run: `npm run build`
Expected: `electron-vite` prints successful builds for main, preload, and renderer with no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts vitest.config.ts vitest.setup.ts tsconfig*.json .gitignore src
git commit -m "feat: scaffold electron-vite + react + typescript project"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`

**Interfaces:**
- Produces: `Suit`, `Rank`, `Card`, `BetSpot`, `Bets`, `Outcome`, `DealResult`, `Settlement`, `HandHistoryEntry`, `SaveData` — used by every engine, state, and component task below.

- [ ] **Step 1: Write `src/shared/types.ts`**

```typescript
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  suit: Suit
  rank: Rank
}

export type BetSpot = 'player' | 'banker' | 'tie'

export interface Bets {
  player: number
  banker: number
  tie: number
}

export type Outcome = 'player' | 'banker' | 'tie'

export interface DealResult {
  playerCards: Card[]
  bankerCards: Card[]
  playerTotal: number
  bankerTotal: number
  outcome: Outcome
}

export interface Settlement {
  bets: Bets
  outcome: Outcome
  payouts: Bets
  netChange: number
}

export interface HandHistoryEntry {
  outcome: Outcome
  playerTotal: number
  bankerTotal: number
  netChange: number
}

export interface SaveData {
  bankroll: number
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared type definitions"
```

---

### Task 3: Engine — shoe (create, shuffle, draw, cut card)

**Files:**
- Create: `src/renderer/src/engine/shoe.ts`
- Test: `src/renderer/src/engine/shoe.test.ts`

**Interfaces:**
- Consumes: `Card`, `Suit`, `Rank` from `@shared/types`.
- Produces: `Shoe` interface (`{ cards: Card[]; cutIndex: number; drawIndex: number }`), `createShoe(randomFn?: () => number): Shoe`, `drawCard(shoe: Shoe): [Card, Shoe]` (pure — returns a new shoe, does not mutate), `isPastCutCard(shoe: Shoe): boolean`. Used by `engine/rules.ts` (Task 4) and `state/gameReducer.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/engine/shoe.test.ts
import { describe, it, expect } from 'vitest'
import { createShoe, drawCard, isPastCutCard, type Shoe } from './shoe'

describe('createShoe', () => {
  it('builds an 8-deck shoe of 416 cards', () => {
    const shoe = createShoe()
    expect(shoe.cards).toHaveLength(416)
    expect(shoe.drawIndex).toBe(0)
  })

  it('places the cut card 14 from the end', () => {
    const shoe = createShoe()
    expect(shoe.cutIndex).toBe(416 - 14)
  })

  it('contains exactly 32 of each rank regardless of shuffle order', () => {
    const shoe = createShoe(() => 0.5)
    const nines = shoe.cards.filter((c) => c.rank === '9')
    expect(nines).toHaveLength(32)
  })

  it('uses the provided random function for shuffling', () => {
    const shoeA = createShoe(() => 0)
    const shoeB = createShoe(() => 0)
    expect(shoeA.cards).toEqual(shoeB.cards)
  })
})

describe('drawCard', () => {
  it('returns the next card and an advanced, unmutated-original shoe', () => {
    const shoe: Shoe = {
      cards: [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' }
      ],
      drawIndex: 0,
      cutIndex: 2
    }
    const [card, nextShoe] = drawCard(shoe)
    expect(card).toEqual({ rank: 'A', suit: 'spades' })
    expect(nextShoe.drawIndex).toBe(1)
    expect(shoe.drawIndex).toBe(0) // original untouched
  })

  it('throws when the shoe is exhausted', () => {
    const shoe: Shoe = { cards: [{ rank: 'A', suit: 'spades' }], drawIndex: 1, cutIndex: 1 }
    expect(() => drawCard(shoe)).toThrow('Shoe is empty')
  })
})

describe('isPastCutCard', () => {
  it('is false before the cut card and true at/after it', () => {
    const shoe: Shoe = { cards: [], drawIndex: 3, cutIndex: 4 }
    expect(isPastCutCard(shoe)).toBe(false)
    expect(isPastCutCard({ ...shoe, drawIndex: 4 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/shoe.test.ts`
Expected: FAIL — `Cannot find module './shoe'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/engine/shoe.ts
import type { Card, Rank, Suit } from '@shared/types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const DECK_COUNT = 8
const CUT_CARD_FROM_END = 14

export interface Shoe {
  cards: Card[]
  drawIndex: number
  cutIndex: number
}

export function createShoe(randomFn: () => number = Math.random): Shoe {
  const cards: Card[] = []
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank })
      }
    }
  }
  shuffle(cards, randomFn)
  return {
    cards,
    drawIndex: 0,
    cutIndex: cards.length - CUT_CARD_FROM_END
  }
}

function shuffle(cards: Card[], randomFn: () => number): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
}

export function drawCard(shoe: Shoe): [Card, Shoe] {
  if (shoe.drawIndex >= shoe.cards.length) {
    throw new Error('Shoe is empty')
  }
  const card = shoe.cards[shoe.drawIndex]
  const nextShoe: Shoe = { ...shoe, drawIndex: shoe.drawIndex + 1 }
  return [card, nextShoe]
}

export function isPastCutCard(shoe: Shoe): boolean {
  return shoe.drawIndex >= shoe.cutIndex
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/engine/shoe.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/shoe.ts src/renderer/src/engine/shoe.test.ts
git commit -m "feat: add 8-deck shoe with cut card"
```

---

### Task 4: Engine — drawing rules and hand play

**Files:**
- Create: `src/renderer/src/engine/rules.ts`
- Test: `src/renderer/src/engine/rules.test.ts`

**Interfaces:**
- Consumes: `Card, Rank, Outcome, DealResult` from `@shared/types`; `Shoe, drawCard` from `./shoe`.
- Produces: `cardValue(rank): number`, `handTotal(cards): number`, `isNatural(total): boolean`, `playerShouldDraw(playerTotal): boolean`, `bankerShouldDraw(bankerTotal, playerThirdCardValue): boolean`, `PlayHandResult` (`DealResult & { shoe: Shoe }`), `playHand(shoe: Shoe): PlayHandResult`. Used by `state/gameReducer.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/engine/rules.test.ts
import { describe, it, expect } from 'vitest'
import type { Card } from '@shared/types'
import type { Shoe } from './shoe'
import {
  bankerShouldDraw,
  cardValue,
  handTotal,
  isNatural,
  playHand,
  playerShouldDraw
} from './rules'

describe('cardValue', () => {
  it('values ace as 1, tens/faces as 0, others as face value', () => {
    expect(cardValue('A')).toBe(1)
    expect(cardValue('10')).toBe(0)
    expect(cardValue('J')).toBe(0)
    expect(cardValue('Q')).toBe(0)
    expect(cardValue('K')).toBe(0)
    expect(cardValue('7')).toBe(7)
  })
})

describe('handTotal', () => {
  it('sums card values mod 10', () => {
    const cards: Card[] = [{ rank: 'K', suit: 'spades' }, { rank: '5', suit: 'hearts' }]
    expect(handTotal(cards)).toBe(5)
  })

  it('wraps totals over 9', () => {
    const cards: Card[] = [{ rank: '9', suit: 'spades' }, { rank: '9', suit: 'hearts' }]
    expect(handTotal(cards)).toBe(8)
  })
})

describe('isNatural', () => {
  it('is true only for 8 or 9', () => {
    expect(isNatural(8)).toBe(true)
    expect(isNatural(9)).toBe(true)
    expect(isNatural(7)).toBe(false)
    expect(isNatural(0)).toBe(false)
  })
})

describe('playerShouldDraw', () => {
  it('draws on 0-5, stands on 6-7', () => {
    expect(playerShouldDraw(0)).toBe(true)
    expect(playerShouldDraw(5)).toBe(true)
    expect(playerShouldDraw(6)).toBe(false)
    expect(playerShouldDraw(7)).toBe(false)
  })
})

describe('bankerShouldDraw', () => {
  it('always draws on 0-2', () => {
    expect(bankerShouldDraw(0, 5)).toBe(true)
    expect(bankerShouldDraw(2, 0)).toBe(true)
  })

  it('on 3, draws unless the player third card was an 8', () => {
    expect(bankerShouldDraw(3, 7)).toBe(true)
    expect(bankerShouldDraw(3, 8)).toBe(false)
  })

  it('on 4, draws only if the player third card was 2-7', () => {
    expect(bankerShouldDraw(4, 2)).toBe(true)
    expect(bankerShouldDraw(4, 7)).toBe(true)
    expect(bankerShouldDraw(4, 1)).toBe(false)
    expect(bankerShouldDraw(4, 8)).toBe(false)
  })

  it('on 5, draws only if the player third card was 4-7', () => {
    expect(bankerShouldDraw(5, 4)).toBe(true)
    expect(bankerShouldDraw(5, 3)).toBe(false)
  })

  it('on 6, draws only if the player third card was 6 or 7', () => {
    expect(bankerShouldDraw(6, 6)).toBe(true)
    expect(bankerShouldDraw(6, 5)).toBe(false)
  })

  it('never draws on 7', () => {
    expect(bankerShouldDraw(7, 9)).toBe(false)
  })

  it('when the player stood (null third card), draws on 0-5', () => {
    expect(bankerShouldDraw(5, null)).toBe(true)
    expect(bankerShouldDraw(6, null)).toBe(false)
  })
})

function makeShoe(cards: Card[]): Shoe {
  return { cards, drawIndex: 0, cutIndex: cards.length }
}

describe('playHand', () => {
  it('stops immediately on a player natural, even with a mediocre banker hand', () => {
    const shoe = makeShoe([
      { rank: '9', suit: 'spades' }, // P1
      { rank: '2', suit: 'spades' }, // B1
      { rank: '10', suit: 'spades' }, // P2 -> player total 9 (natural)
      { rank: '3', suit: 'spades' } // B2 -> banker total 5
    ])
    const result = playHand(shoe)
    expect(result.playerTotal).toBe(9)
    expect(result.bankerTotal).toBe(5)
    expect(result.outcome).toBe('player')
    expect(result.shoe.drawIndex).toBe(4)
  })

  it('ends in a tie when both hands are natural with equal totals', () => {
    const shoe = makeShoe([
      { rank: '9', suit: 'spades' }, // P1
      { rank: '9', suit: 'hearts' }, // B1
      { rank: '10', suit: 'spades' }, // P2 -> player 9
      { rank: '10', suit: 'hearts' } // B2 -> banker 9
    ])
    const result = playHand(shoe)
    expect(result.outcome).toBe('tie')
    expect(result.shoe.drawIndex).toBe(4)
  })

  it('draws a banker third card when the player stood on 6-7', () => {
    const shoe = makeShoe([
      { rank: '6', suit: 'spades' }, // P1
      { rank: '2', suit: 'spades' }, // B1
      { rank: '10', suit: 'spades' }, // P2 -> player total 6, stands
      { rank: '2', suit: 'hearts' }, // B2 -> banker total 4, draws (player stood)
      { rank: '3', suit: 'clubs' } // B3 -> banker total 7
    ])
    const result = playHand(shoe)
    expect(result.playerCards).toHaveLength(2)
    expect(result.playerTotal).toBe(6)
    expect(result.bankerTotal).toBe(7)
    expect(result.outcome).toBe('banker')
    expect(result.shoe.drawIndex).toBe(5)
  })

  it('draws both a player and banker third card per the fixed matrix', () => {
    const shoe = makeShoe([
      { rank: '4', suit: 'spades' }, // P1
      { rank: 'A', suit: 'hearts' }, // B1
      { rank: 'A', suit: 'diamonds' }, // P2 -> player total 5, draws
      { rank: '2', suit: 'clubs' }, // B2 -> banker total 3
      { rank: '5', suit: 'spades' }, // P3 -> player total 0 (5+5=10 mod 10)
      { rank: '9', suit: 'hearts' } // B3 -> banker draws (3rd card 5 != 8) -> total 2
    ])
    const result = playHand(shoe)
    expect(result.playerCards).toHaveLength(3)
    expect(result.bankerCards).toHaveLength(3)
    expect(result.playerTotal).toBe(0)
    expect(result.bankerTotal).toBe(2)
    expect(result.outcome).toBe('banker')
    expect(result.shoe.drawIndex).toBe(6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/rules.test.ts`
Expected: FAIL — `Cannot find module './rules'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/engine/rules.ts
import type { Card, DealResult, Rank } from '@shared/types'
import { drawCard, type Shoe } from './shoe'

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 1
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0
  return parseInt(rank, 10)
}

export function handTotal(cards: Card[]): number {
  const sum = cards.reduce((acc, c) => acc + cardValue(c.rank), 0)
  return sum % 10
}

export function isNatural(total: number): boolean {
  return total === 8 || total === 9
}

export function playerShouldDraw(playerTotal: number): boolean {
  return playerTotal <= 5
}

export function bankerShouldDraw(bankerTotal: number, playerThirdCardValue: number | null): boolean {
  if (playerThirdCardValue === null) {
    return bankerTotal <= 5
  }
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true
    case 3:
      return playerThirdCardValue !== 8
    case 4:
      return playerThirdCardValue >= 2 && playerThirdCardValue <= 7
    case 5:
      return playerThirdCardValue >= 4 && playerThirdCardValue <= 7
    case 6:
      return playerThirdCardValue === 6 || playerThirdCardValue === 7
    default:
      return false
  }
}

export interface PlayHandResult extends DealResult {
  shoe: Shoe
}

export function playHand(initialShoe: Shoe): PlayHandResult {
  let shoe = initialShoe
  const draw = (): Card => {
    const [card, nextShoe] = drawCard(shoe)
    shoe = nextShoe
    return card
  }

  const playerCards: Card[] = [draw()]
  const bankerCards: Card[] = [draw()]
  playerCards.push(draw())
  bankerCards.push(draw())

  let playerTotal = handTotal(playerCards)
  let bankerTotal = handTotal(bankerCards)

  if (!isNatural(playerTotal) && !isNatural(bankerTotal)) {
    let playerThirdCardValue: number | null = null

    if (playerShouldDraw(playerTotal)) {
      const thirdCard = draw()
      playerCards.push(thirdCard)
      playerThirdCardValue = cardValue(thirdCard.rank)
      playerTotal = handTotal(playerCards)
    }

    if (bankerShouldDraw(bankerTotal, playerThirdCardValue)) {
      bankerCards.push(draw())
      bankerTotal = handTotal(bankerCards)
    }
  }

  const outcome = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie'

  return { playerCards, bankerCards, playerTotal, bankerTotal, outcome, shoe }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/engine/rules.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/rules.ts src/renderer/src/engine/rules.test.ts
git commit -m "feat: add baccarat drawing rules and hand play"
```

---

### Task 5: Engine — payouts

**Files:**
- Create: `src/renderer/src/engine/payouts.ts`
- Test: `src/renderer/src/engine/payouts.test.ts`

**Interfaces:**
- Consumes: `Bets, Outcome, Settlement` from `@shared/types`.
- Produces: `computeSettlement(bets: Bets, outcome: Outcome): Settlement`. Used by `state/gameReducer.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/engine/payouts.test.ts
import { describe, it, expect } from 'vitest'
import { computeSettlement } from './payouts'

describe('computeSettlement', () => {
  it('pays a player win 1:1, stake included', () => {
    const result = computeSettlement({ player: 100, banker: 0, tie: 0 }, 'player')
    expect(result.payouts).toEqual({ player: 200, banker: 0, tie: 0 })
    expect(result.netChange).toBe(100)
  })

  it('loses a losing banker bet when player wins', () => {
    const result = computeSettlement({ player: 50, banker: 30, tie: 0 }, 'player')
    expect(result.payouts).toEqual({ player: 100, banker: 0, tie: 0 })
    expect(result.netChange).toBe(20) // +100 -50 -30
  })

  it('pays a banker win 1:1 minus 5% commission', () => {
    const result = computeSettlement({ player: 0, banker: 100, tie: 0 }, 'banker')
    expect(result.payouts).toEqual({ player: 0, banker: 195, tie: 0 })
    expect(result.netChange).toBe(95)
  })

  it('rounds commission to the nearest cent', () => {
    const result = computeSettlement({ player: 0, banker: 5, tie: 0 }, 'banker')
    expect(result.payouts.banker).toBe(9.75)
    expect(result.netChange).toBe(4.75)
  })

  it('pays a tie bet 8:1 and pushes player/banker bets', () => {
    const result = computeSettlement({ player: 20, banker: 0, tie: 10 }, 'tie')
    expect(result.payouts).toEqual({ player: 20, banker: 0, tie: 90 })
    expect(result.netChange).toBe(80) // +20 (push) +90 (tie win) -20 -10
  })

  it('pushes both player and banker bets on a tie with no tie bet', () => {
    const result = computeSettlement({ player: 20, banker: 30, tie: 0 }, 'tie')
    expect(result.payouts).toEqual({ player: 20, banker: 30, tie: 0 })
    expect(result.netChange).toBe(0)
  })

  it('loses a tie bet when the outcome is not a tie', () => {
    const result = computeSettlement({ player: 0, banker: 0, tie: 50 }, 'player')
    expect(result.payouts).toEqual({ player: 0, banker: 0, tie: 0 })
    expect(result.netChange).toBe(-50)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/engine/payouts.test.ts`
Expected: FAIL — `Cannot find module './payouts'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/engine/payouts.ts
import type { Bets, Outcome, Settlement } from '@shared/types'

const BANKER_COMMISSION = 0.05
const TIE_PROFIT_MULTIPLIER = 8

function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/engine/payouts.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/engine/payouts.ts src/renderer/src/engine/payouts.test.ts
git commit -m "feat: add bet settlement with commission, tie push, and multi-bet"
```

---

### Task 6: Main process — bankroll persistence

**Files:**
- Create: `src/main/persistence.ts`
- Test: `src/main/persistence.test.ts`

**Interfaces:**
- Consumes: `SaveData` from `@shared/types`.
- Produces: `DEFAULT_BANKROLL: number`, `loadSaveData(saveDir: string): Promise<SaveData>`, `saveSaveData(data: SaveData, saveDir: string): Promise<void>`. Used by `main/ipcHandlers.ts` (Task 7). Note: functions take an explicit directory parameter (no dependency on `electron.app` at import time) so they're testable without an Electron runtime.

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/persistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSaveData, saveSaveData, DEFAULT_BANKROLL } from './persistence'

let tempDir: string

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vegas-test-'))
})

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('persistence', () => {
  it('returns the default bankroll when no save file exists', async () => {
    const data = await loadSaveData(tempDir)
    expect(data.bankroll).toBe(DEFAULT_BANKROLL)
  })

  it('saves and reloads a bankroll value', async () => {
    await saveSaveData({ bankroll: 2500 }, tempDir)
    const data = await loadSaveData(tempDir)
    expect(data.bankroll).toBe(2500)
  })

  it('falls back to the default when the save file is corrupt', async () => {
    await fs.mkdir(tempDir, { recursive: true })
    await fs.writeFile(path.join(tempDir, 'save.json'), 'not valid json', 'utf-8')
    const data = await loadSaveData(tempDir)
    expect(data.bankroll).toBe(DEFAULT_BANKROLL)
  })

  it('creates the save directory if it does not exist yet', async () => {
    const nestedDir = path.join(tempDir, 'nested')
    await saveSaveData({ bankroll: 500 }, nestedDir)
    const data = await loadSaveData(nestedDir)
    expect(data.bankroll).toBe(500)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/persistence.test.ts`
Expected: FAIL — `Cannot find module './persistence'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/persistence.ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SaveData } from '@shared/types'

export const DEFAULT_BANKROLL = 1000

function saveFilePath(saveDir: string): string {
  return path.join(saveDir, 'save.json')
}

export async function loadSaveData(saveDir: string): Promise<SaveData> {
  const filePath = saveFilePath(saveDir)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.bankroll === 'number' && parsed.bankroll >= 0) {
      return { bankroll: parsed.bankroll }
    }
    return { bankroll: DEFAULT_BANKROLL }
  } catch {
    return { bankroll: DEFAULT_BANKROLL }
  }
}

export async function saveSaveData(data: SaveData, saveDir: string): Promise<void> {
  await fs.mkdir(saveDir, { recursive: true })
  await fs.writeFile(saveFilePath(saveDir), JSON.stringify(data, null, 2), 'utf-8')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/persistence.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/persistence.ts src/main/persistence.test.ts
git commit -m "feat: add bankroll persistence to a userData JSON file"
```

---

### Task 7: Main process — IPC wiring and preload bridge

**Files:**
- Create: `src/main/ipcHandlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: `loadSaveData, saveSaveData, DEFAULT_BANKROLL` from `./persistence`.
- Produces: `handleLoadBankroll(): Promise<number>`, `handleSaveBankroll(amount: number): Promise<void>`, the IPC channels `'load-bankroll'`/`'save-bankroll'`, and `window.electronAPI.loadBankroll()/saveBankroll(amount)` in the renderer. Used by `state/GameContext.tsx` (Task 9).

This task wires framework glue (Electron `app`/`ipcMain`/`contextBridge`) that only runs inside a real Electron process, so it isn't unit-testable the way pure logic is — its correctness is verified by typecheck + build instead of a Vitest test.

- [ ] **Step 1: Write `src/main/ipcHandlers.ts`**

```typescript
// src/main/ipcHandlers.ts
import { app } from 'electron'
import { loadSaveData, saveSaveData } from './persistence'

export async function handleLoadBankroll(): Promise<number> {
  const data = await loadSaveData(app.getPath('userData'))
  return data.bankroll
}

export async function handleSaveBankroll(amount: number): Promise<void> {
  await saveSaveData({ bankroll: amount }, app.getPath('userData'))
}
```

- [ ] **Step 2: Wire the handlers into `src/main/index.ts`**

Add these imports at the top:

```typescript
import { ipcMain } from 'electron'
import { handleLoadBankroll, handleSaveBankroll } from './ipcHandlers'
```

Add this inside `app.whenReady().then(() => { ... })`, before `createWindow()`:

```typescript
ipcMain.handle('load-bankroll', () => handleLoadBankroll())
ipcMain.handle('save-bankroll', (_event, amount: number) => handleSaveBankroll(amount))
```

- [ ] **Step 3: Replace `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  loadBankroll: (): Promise<number> => ipcRenderer.invoke('load-bankroll'),
  saveBankroll: (amount: number): Promise<void> => ipcRenderer.invoke('save-bankroll', amount)
})
```

- [ ] **Step 4: Write `src/renderer/src/env.d.ts`**

```typescript
export {}

declare global {
  interface Window {
    electronAPI: {
      loadBankroll: () => Promise<number>
      saveBankroll: (amount: number) => Promise<void>
    }
  }
}
```

- [ ] **Step 5: Verify it compiles and builds**

Run: `npm run typecheck`
Expected: no output, exit code 0.

Run: `npm run build`
Expected: successful build for main, preload, and renderer.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipcHandlers.ts src/main/index.ts src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat: wire bankroll persistence through IPC and contextBridge"
```

---

### Task 8: Game state reducer

**Files:**
- Create: `src/renderer/src/state/gameReducer.ts`
- Test: `src/renderer/src/state/gameReducer.test.ts`

**Interfaces:**
- Consumes: `Bets, BetSpot, HandHistoryEntry, Settlement` from `@shared/types`; `createShoe, isPastCutCard, Shoe` from `../engine/shoe`; `playHand, PlayHandResult` from `../engine/rules`; `computeSettlement` from `../engine/payouts`.
- Produces: `TABLE_MIN_BET` (5), `TABLE_MAX_BET` (500), `GamePhase`, `GameState`, `GameAction`, `createInitialState(bankroll, randomFn?): GameState`, `gameReducer(state, action): GameState`. Used by `state/GameContext.tsx` (Task 9) and every UI component from Task 11 onward. `TABLE_MIN_BET`/`TABLE_MAX_BET` are re-exported so `components/Table.tsx` (Task 13) enforces the same limits in the UI that the reducer enforces as the source of truth.

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/state/gameReducer.test.ts
import { describe, it, expect } from 'vitest'
import type { Card } from '@shared/types'
import type { Shoe } from '../engine/shoe'
import { gameReducer, createInitialState, type GameState } from './gameReducer'

function makeShoe(cards: Card[], cutIndex = cards.length): Shoe {
  return { cards, drawIndex: 0, cutIndex }
}

const NATURAL_PLAYER_WIN_CARDS: Card[] = [
  { rank: '9', suit: 'spades' }, // P1
  { rank: '2', suit: 'spades' }, // B1
  { rank: '10', suit: 'spades' }, // P2 -> player total 9 (natural)
  { rank: '3', suit: 'spades' } // B2 -> banker total 5
]

function stateWithShoe(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState(1000)
  return { ...base, shoe: makeShoe(NATURAL_PLAYER_WIN_CARDS), ...overrides }
}

describe('gameReducer', () => {
  it('PLACE_BET deducts the bankroll and records the bet', () => {
    const state = stateWithShoe()
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 50 })
    expect(next.bankroll).toBe(950)
    expect(next.bets.player).toBe(50)
  })

  it('PLACE_BET is a no-op when the amount exceeds the bankroll', () => {
    const state = stateWithShoe({ bankroll: 10 })
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 50 })
    expect(next).toBe(state)
  })

  it('PLACE_BET is a no-op when stacking would exceed the $500 table max for that spot', () => {
    const state = stateWithShoe({ bankroll: 1000, bets: { player: 400, banker: 0, tie: 0 } })
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 500 })
    expect(next).toBe(state)
    const accepted = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 100 })
    expect(accepted.bets.player).toBe(500)
  })

  it('PLACE_BET is a no-op outside the betting phase', () => {
    const state = stateWithShoe({ phase: 'result' })
    const next = gameReducer(state, { type: 'PLACE_BET', spot: 'player', amount: 50 })
    expect(next).toBe(state)
  })

  it('CLEAR_BETS refunds all wagered chips', () => {
    const state = stateWithShoe({ bankroll: 930, bets: { player: 50, banker: 20, tie: 0 } })
    const next = gameReducer(state, { type: 'CLEAR_BETS' })
    expect(next.bankroll).toBe(1000)
    expect(next.bets).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('DEAL is a no-op when no bets are placed', () => {
    const state = stateWithShoe()
    const next = gameReducer(state, { type: 'DEAL' })
    expect(next).toBe(state)
  })

  it('DEAL settles the hand, credits the bankroll, and records history', () => {
    const state = stateWithShoe({ bankroll: 900, bets: { player: 100, banker: 0, tie: 0 } })
    const next = gameReducer(state, { type: 'DEAL' })
    expect(next.phase).toBe('result')
    expect(next.bankroll).toBe(1100)
    expect(next.lastResult?.outcome).toBe('player')
    expect(next.shoeHistory).toHaveLength(1)
    expect(next.sessionHistory).toHaveLength(1)
  })

  it('NEW_HAND returns to betting and clears the current bets', () => {
    const dealt = gameReducer(
      stateWithShoe({ bankroll: 900, bets: { player: 100, banker: 0, tie: 0 } }),
      { type: 'DEAL' }
    )
    const next = gameReducer(dealt, { type: 'NEW_HAND' })
    expect(next.phase).toBe('betting')
    expect(next.bets).toEqual({ player: 0, banker: 0, tie: 0 })
    expect(next.lastResult).toBeNull()
    expect(next.shoeHistory).toHaveLength(1)
  })

  it('NEW_HAND reshuffles and resets shoeHistory once the cut card is passed', () => {
    const state = stateWithShoe({
      bankroll: 900,
      bets: { player: 100, banker: 0, tie: 0 },
      shoe: makeShoe(NATURAL_PLAYER_WIN_CARDS, 4)
    })
    const dealt = gameReducer(state, { type: 'DEAL' })
    expect(dealt.shoe.drawIndex).toBe(4)
    const next = gameReducer(dealt, { type: 'NEW_HAND' })
    expect(next.shoe.cards).toHaveLength(416)
    expect(next.shoe.drawIndex).toBe(0)
    expect(next.shoeHistory).toHaveLength(0)
    expect(next.sessionHistory).toHaveLength(1)
  })

  it('ADD_FUNDS increases the bankroll and ignores non-positive amounts', () => {
    const state = stateWithShoe({ bankroll: 0 })
    expect(gameReducer(state, { type: 'ADD_FUNDS', amount: 1000 }).bankroll).toBe(1000)
    expect(gameReducer(state, { type: 'ADD_FUNDS', amount: -5 })).toBe(state)
  })

  it('SET_BANKROLL overwrites the bankroll, clamped at zero', () => {
    const state = stateWithShoe()
    expect(gameReducer(state, { type: 'SET_BANKROLL', amount: 750 }).bankroll).toBe(750)
    expect(gameReducer(state, { type: 'SET_BANKROLL', amount: -20 }).bankroll).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/state/gameReducer.test.ts`
Expected: FAIL — `Cannot find module './gameReducer'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/state/gameReducer.ts
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
  shoeHistory: HandHistoryEntry[]
  sessionHistory: HandHistoryEntry[]
}

export type GameAction =
  | { type: 'PLACE_BET'; spot: BetSpot; amount: number }
  | { type: 'CLEAR_BETS' }
  | { type: 'DEAL' }
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
        shoeHistory: [...state.shoeHistory, historyEntry],
        sessionHistory: [...state.sessionHistory, historyEntry]
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/state/gameReducer.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/state/gameReducer.ts src/renderer/src/state/gameReducer.test.ts
git commit -m "feat: add pure game state reducer"
```

---

### Task 9: React game context provider

**Files:**
- Create: `src/renderer/src/state/GameContext.tsx`
- Test: `src/renderer/src/state/GameContext.test.tsx`

**Interfaces:**
- Consumes: `gameReducer, createInitialState, GameState, GameAction` from `./gameReducer`; `window.electronAPI` from `env.d.ts` (Task 7).
- Produces: `GameProvider({ children })`, `useGame(): { state: GameState; dispatch: React.Dispatch<GameAction> }`. Used by every UI component from Task 11 onward.

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/state/GameContext.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GameProvider, useGame } from './GameContext'

function TestConsumer() {
  const { state, dispatch } = useGame()
  return (
    <div>
      <span data-testid="bankroll">{state.bankroll}</span>
      <button onClick={() => dispatch({ type: 'PLACE_BET', spot: 'player', amount: 25 })}>
        bet
      </button>
    </div>
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadBankroll: vi.fn().mockResolvedValue(750),
      saveBankroll: vi.fn().mockResolvedValue(undefined)
    },
    writable: true
  })
})

describe('GameProvider', () => {
  it('loads the persisted bankroll on mount', async () => {
    render(
      <GameProvider>
        <TestConsumer />
      </GameProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('bankroll')).toHaveTextContent('750')
    })
  })

  it('dispatches actions through the reducer', async () => {
    render(
      <GameProvider>
        <TestConsumer />
      </GameProvider>
    )
    await waitFor(() => expect(screen.getByTestId('bankroll')).toHaveTextContent('750'))
    screen.getByText('bet').click()
    await waitFor(() => expect(screen.getByTestId('bankroll')).toHaveTextContent('725'))
  })

  it('throws if useGame is called outside a GameProvider', () => {
    function Broken() {
      useGame()
      return null
    }
    expect(() => render(<Broken />)).toThrow('useGame must be used within a GameProvider')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/state/GameContext.test.tsx`
Expected: FAIL — `Cannot find module './GameContext'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/state/GameContext.tsx
import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
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

  useEffect(() => {
    let cancelled = false
    window.electronAPI.loadBankroll().then((bankroll) => {
      if (!cancelled) {
        dispatch({ type: 'SET_BANKROLL', amount: bankroll })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    window.electronAPI.saveBankroll(state.bankroll)
  }, [state.bankroll])

  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within a GameProvider')
  return ctx
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/state/GameContext.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/state/GameContext.tsx src/renderer/src/state/GameContext.test.tsx
git commit -m "feat: add GameProvider wiring the reducer to bankroll persistence"
```

---

### Task 10: Sound manager (synthesized, no audio assets)

**Files:**
- Create: `src/renderer/src/sounds/soundManager.ts`
- Test: `src/renderer/src/sounds/soundManager.test.ts`

**Interfaces:**
- Produces: `playChipSound()`, `playDealSound()`, `playWinSound()`, `playLoseSound()`, `resetAudioContextForTests()`. Used by `components/Table.tsx` (Task 13).

Sounds are synthesized with the Web Audio API (short oscillator tones) rather than shipped as audio files — this needs no external assets and stays fully testable.

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/sounds/soundManager.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  playChipSound,
  playDealSound,
  playWinSound,
  playLoseSound,
  resetAudioContextForTests
} from './soundManager'

class FakeOscillator {
  type = 'sine'
  frequency = { value: 0 }
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  connect = vi.fn()
}

class FakeAudioContext {
  currentTime = 0
  destination = {}
  createOscillator(): FakeOscillator {
    return new FakeOscillator()
  }
  createGain(): FakeGain {
    return new FakeGain()
  }
}

beforeEach(() => {
  resetAudioContextForTests()
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

describe('soundManager', () => {
  it('plays a chip sound without throwing', () => {
    expect(() => playChipSound()).not.toThrow()
  })

  it('plays a deal sound without throwing', () => {
    expect(() => playDealSound()).not.toThrow()
  })

  it('plays a win sound (two tones) without throwing', () => {
    vi.useFakeTimers()
    expect(() => playWinSound()).not.toThrow()
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('plays a lose sound without throwing', () => {
    expect(() => playLoseSound()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/sounds/soundManager.test.ts`
Expected: FAIL — `Cannot find module './soundManager'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/sounds/soundManager.ts
let audioContext: AudioContext | null = null

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

function playTone(frequency: number, durationMs: number, type: OscillatorType = 'sine'): void {
  const ctx = getContext()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + durationMs / 1000)
}

export function playChipSound(): void {
  playTone(1200, 80, 'square')
}

export function playDealSound(): void {
  playTone(600, 60, 'triangle')
}

export function playWinSound(): void {
  playTone(880, 150, 'sine')
  setTimeout(() => playTone(1320, 200, 'sine'), 120)
}

export function playLoseSound(): void {
  playTone(300, 250, 'sawtooth')
}

export function resetAudioContextForTests(): void {
  audioContext = null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/sounds/soundManager.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sounds/soundManager.ts src/renderer/src/sounds/soundManager.test.ts
git commit -m "feat: add synthesized sound effects via Web Audio API"
```

---

### Task 11: Chip and ChipRack components

**Files:**
- Create: `src/renderer/src/components/Chip.tsx`
- Create: `src/renderer/src/components/Chip.css`
- Create: `src/renderer/src/components/ChipRack.tsx`
- Test: `src/renderer/src/components/ChipRack.test.tsx`

**Interfaces:**
- Produces: `Chip({ value, selected?, onClick? })`, `CHIP_VALUES` (`[1, 5, 25, 100, 500]`), `ChipRack({ selectedValue, onSelect })`. Used by `components/Table.tsx` (Task 13).

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/components/ChipRack.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChipRack, CHIP_VALUES } from './ChipRack'

describe('ChipRack', () => {
  it('renders one chip per denomination', () => {
    render(<ChipRack selectedValue={5} onSelect={() => {}} />)
    CHIP_VALUES.forEach((value) => {
      expect(screen.getByText(`$${value}`)).toBeInTheDocument()
    })
  })

  it('marks the selected chip as pressed', () => {
    render(<ChipRack selectedValue={25} onSelect={() => {}} />)
    expect(screen.getByTestId('chip-25')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('chip-5')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelect with the clicked chip value', () => {
    const onSelect = vi.fn()
    render(<ChipRack selectedValue={5} onSelect={onSelect} />)
    screen.getByTestId('chip-100').click()
    expect(onSelect).toHaveBeenCalledWith(100)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/ChipRack.test.tsx`
Expected: FAIL — `Cannot find module './ChipRack'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/components/Chip.tsx
import './Chip.css'

const CHIP_COLORS: Record<number, string> = {
  1: '#f5f5f5',
  5: '#c0392b',
  25: '#1e8449',
  100: '#1c1c1c',
  500: '#7d3c98'
}

interface ChipProps {
  value: number
  selected?: boolean
  onClick?: () => void
}

export function Chip({ value, selected = false, onClick }: ChipProps) {
  const color = CHIP_COLORS[value] ?? '#333'
  return (
    <button
      type="button"
      data-testid={`chip-${value}`}
      className={`chip${selected ? ' chip--selected' : ''}`}
      style={{ backgroundColor: color }}
      onClick={onClick}
      aria-pressed={selected}
    >
      ${value}
    </button>
  )
}
```

```css
/* src/renderer/src/components/Chip.css */
.chip {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 3px dashed rgba(255, 255, 255, 0.6);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s ease;
}

.chip:hover {
  transform: translateY(-2px);
}

.chip--selected {
  outline: 3px solid #ffd700;
  outline-offset: 2px;
}
```

```typescript
// src/renderer/src/components/ChipRack.tsx
import { Chip } from './Chip'
import './ChipRack.css'

export const CHIP_VALUES = [1, 5, 25, 100, 500] as const

interface ChipRackProps {
  selectedValue: number
  onSelect: (value: number) => void
}

export function ChipRack({ selectedValue, onSelect }: ChipRackProps) {
  return (
    <div className="chip-rack">
      {CHIP_VALUES.map((value) => (
        <Chip
          key={value}
          value={value}
          selected={value === selectedValue}
          onClick={() => onSelect(value)}
        />
      ))}
    </div>
  )
}
```

```css
/* src/renderer/src/components/ChipRack.css */
.chip-rack {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 12px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/components/ChipRack.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Chip.tsx src/renderer/src/components/Chip.css src/renderer/src/components/ChipRack.tsx src/renderer/src/components/ChipRack.css src/renderer/src/components/ChipRack.test.tsx
git commit -m "feat: add chip and chip rack components"
```

---

### Task 12: Card and Hand components

**Files:**
- Create: `src/renderer/src/components/Card.tsx`
- Create: `src/renderer/src/components/Card.css`
- Create: `src/renderer/src/components/Hand.tsx`
- Create: `src/renderer/src/components/Hand.css`
- Test: `src/renderer/src/components/Card.test.tsx`
- Test: `src/renderer/src/components/Hand.test.tsx`

**Interfaces:**
- Consumes: `Card` (as `Card as CardType`) from `@shared/types`.
- Produces: `PlayingCard({ card })`, `Hand({ label, cards, total })`. Used by `components/Table.tsx` (Task 13).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/src/components/Card.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayingCard } from './Card'

describe('PlayingCard', () => {
  it('renders the rank and a red suit symbol for hearts', () => {
    const { container } = render(<PlayingCard card={{ rank: 'K', suit: 'hearts' }} />)
    expect(screen.getByText('K')).toBeInTheDocument()
    expect(screen.getByText('♥')).toBeInTheDocument()
    expect(container.querySelector('.playing-card--red')).not.toBeNull()
  })

  it('renders a black suit symbol for spades', () => {
    const { container } = render(<PlayingCard card={{ rank: '10', suit: 'spades' }} />)
    expect(screen.getByText('♠')).toBeInTheDocument()
    expect(container.querySelector('.playing-card--black')).not.toBeNull()
  })
})
```

```typescript
// src/renderer/src/components/Hand.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hand } from './Hand'

describe('Hand', () => {
  it('renders a card per entry and the running total', () => {
    const { container } = render(
      <Hand
        label="Player"
        cards={[
          { rank: '9', suit: 'spades' },
          { rank: '10', suit: 'hearts' }
        ]}
        total={9}
      />
    )
    expect(screen.getByText('Player')).toBeInTheDocument()
    expect(container.querySelectorAll('.playing-card')).toHaveLength(2)
    expect(container.querySelector('.hand__total')).toHaveTextContent('9')
  })

  it('omits the total element when null', () => {
    const { container } = render(<Hand label="Banker" cards={[]} total={null} />)
    expect(container.querySelector('.hand__total')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/Card.test.tsx src/renderer/src/components/Hand.test.tsx`
Expected: FAIL — `Cannot find module './Card'` / `'./Hand'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/components/Card.tsx
import type { Card as CardType } from '@shared/types'
import './Card.css'

const SUIT_SYMBOLS: Record<CardType['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
}

const RED_SUITS = new Set<CardType['suit']>(['hearts', 'diamonds'])

interface PlayingCardProps {
  card: CardType
}

export function PlayingCard({ card }: PlayingCardProps) {
  const isRed = RED_SUITS.has(card.suit)
  return (
    <div className={`playing-card${isRed ? ' playing-card--red' : ' playing-card--black'}`}>
      <span className="playing-card__rank">{card.rank}</span>
      <span className="playing-card__suit">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  )
}
```

```css
/* src/renderer/src/components/Card.css */
.playing-card {
  width: 56px;
  height: 80px;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  animation: deal-in 0.25s ease-out;
}

.playing-card--red {
  color: #c0392b;
}

.playing-card--black {
  color: #1c1c1c;
}

.playing-card__rank {
  font-size: 1.1rem;
}

.playing-card__suit {
  font-size: 1.4rem;
}

@keyframes deal-in {
  from {
    transform: translateY(-16px) scale(0.9);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
```

```typescript
// src/renderer/src/components/Hand.tsx
import type { Card as CardType } from '@shared/types'
import { PlayingCard } from './Card'
import './Hand.css'

interface HandProps {
  label: string
  cards: CardType[]
  total: number | null
}

export function Hand({ label, cards, total }: HandProps) {
  return (
    <div className="hand">
      <div className="hand__label">
        {label}
        {total !== null && <span className="hand__total">{total}</span>}
      </div>
      <div className="hand__cards">
        {cards.map((card, index) => (
          <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} />
        ))}
      </div>
    </div>
  )
}
```

```css
/* src/renderer/src/components/Hand.css */
.hand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hand__label {
  color: #fff;
  font-weight: 600;
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.hand__total {
  font-size: 1.2rem;
  color: #ffd700;
}

.hand__cards {
  display: flex;
  gap: 8px;
  min-height: 80px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/Card.test.tsx src/renderer/src/components/Hand.test.tsx`
Expected: PASS, 4 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Card.tsx src/renderer/src/components/Card.css src/renderer/src/components/Hand.tsx src/renderer/src/components/Hand.css src/renderer/src/components/Card.test.tsx src/renderer/src/components/Hand.test.tsx
git commit -m "feat: add playing card and hand components"
```

---

### Task 13: Table component (betting spots, deal/clear, wiring)

**Files:**
- Create: `src/renderer/src/components/Table.tsx`
- Create: `src/renderer/src/components/Table.css`
- Test: `src/renderer/src/components/Table.test.tsx`

**Interfaces:**
- Consumes: `useGame` from `../state/GameContext`; `TABLE_MIN_BET, TABLE_MAX_BET` from `../state/gameReducer`; `BetSpot` from `@shared/types`; `ChipRack` from `./ChipRack`; `Hand` from `./Hand`; `playChipSound, playDealSound, playWinSound, playLoseSound` from `../sounds/soundManager`.
- Produces: `Table()`, rendering a root element with `data-testid="table"` and betting spot buttons with `data-testid="bet-spot-player" | "bet-spot-banker" | "bet-spot-tie"`. Used by `App.tsx` (Task 17).

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/components/Table.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GameProvider } from '../state/GameContext'
import { Table } from './Table'

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadBankroll: vi.fn().mockResolvedValue(1000),
      saveBankroll: vi.fn().mockResolvedValue(undefined)
    },
    writable: true
  })
})

async function renderTable() {
  render(
    <GameProvider>
      <Table />
    </GameProvider>
  )
  await waitFor(() => expect(screen.getByText('Bankroll: $1000')).toBeInTheDocument())
}

describe('Table', () => {
  it('places a bet on the clicked spot with the selected chip value', async () => {
    await renderTable()
    screen.getByTestId('chip-25').click()
    screen.getByTestId('bet-spot-player').click()
    await waitFor(() => expect(screen.getByText('Bankroll: $975')).toBeInTheDocument())
  })

  it('disables Deal until the table minimum is met', async () => {
    await renderTable()
    expect(screen.getByText('Deal')).toBeDisabled()
    screen.getByTestId('chip-5').click()
    screen.getByTestId('bet-spot-banker').click()
    await waitFor(() => expect(screen.getByText('Deal')).not.toBeDisabled())
  })

  it('clears all bets and refunds the bankroll', async () => {
    await renderTable()
    screen.getByTestId('chip-25').click()
    screen.getByTestId('bet-spot-player').click()
    await waitFor(() => expect(screen.getByText('Bankroll: $975')).toBeInTheDocument())
    screen.getByText('Clear').click()
    await waitFor(() => expect(screen.getByText('Bankroll: $1000')).toBeInTheDocument())
  })

  it('stops accepting chips on a spot once the $500 table max is reached', async () => {
    await renderTable()
    screen.getByTestId('chip-500').click()
    screen.getByTestId('bet-spot-player').click() // spot now at $500
    await waitFor(() => expect(screen.getByText('Bankroll: $500')).toBeInTheDocument())
    screen.getByTestId('bet-spot-player').click() // should be rejected, spot already at max
    await waitFor(() => expect(screen.getByText('Bankroll: $500')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/Table.test.tsx`
Expected: FAIL — `Cannot find module './Table'`.

- [ ] **Step 3: Write the implementation**

```typescript
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
```

```css
/* src/renderer/src/components/Table.css */
.table {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 24px;
  background: radial-gradient(ellipse at center, #0b5e33 0%, #063a20 100%);
  border-radius: 16px;
  border: 6px solid #4a2f1a;
}

.table__hands {
  display: flex;
  gap: 48px;
}

.table__spots {
  display: flex;
  gap: 16px;
}

.table__spot {
  min-width: 100px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.table__spot:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.table__spot-label {
  font-weight: 700;
}

.table__controls {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #fff;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/components/Table.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Table.tsx src/renderer/src/components/Table.css src/renderer/src/components/Table.test.tsx
git commit -m "feat: add table component with betting spots and deal flow"
```

---

### Task 14: Big Road scoreboard

**Files:**
- Create: `src/renderer/src/state/bigRoad.ts`
- Test: `src/renderer/src/state/bigRoad.test.ts`
- Create: `src/renderer/src/components/BigRoad.tsx`
- Create: `src/renderer/src/components/BigRoad.css`
- Test: `src/renderer/src/components/BigRoad.test.tsx`

**Interfaces:**
- Consumes: `HandHistoryEntry` from `@shared/types`.
- Produces: `BigRoadCell` (`{ outcome: 'player' | 'banker'; tieCount: number }`), `buildBigRoad(history): (BigRoadCell | null)[][]`, `BigRoad({ history })`. Used by `App.tsx` (Task 17) with `state.shoeHistory`.

- [ ] **Step 1: Write the failing test for the pure grid builder**

```typescript
// src/renderer/src/state/bigRoad.test.ts
import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad } from './bigRoad'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('buildBigRoad', () => {
  it('returns an empty grid for no history', () => {
    expect(buildBigRoad([])).toEqual([])
  })

  it('places the first outcome at column 0, row 0', () => {
    const grid = buildBigRoad([entry('player')])
    expect(grid[0][0]).toEqual({ outcome: 'player', tieCount: 0 })
  })

  it('continues a streak down the same column', () => {
    const grid = buildBigRoad([entry('banker'), entry('banker'), entry('banker')])
    expect(grid[0][0]?.outcome).toBe('banker')
    expect(grid[0][1]?.outcome).toBe('banker')
    expect(grid[0][2]?.outcome).toBe('banker')
    expect(grid).toHaveLength(1)
  })

  it('starts a new column when the outcome changes', () => {
    const grid = buildBigRoad([entry('player'), entry('banker')])
    expect(grid[0][0]).toEqual({ outcome: 'player', tieCount: 0 })
    expect(grid[1][0]).toEqual({ outcome: 'banker', tieCount: 0 })
  })

  it('marks a tie on the preceding cell instead of adding a new one', () => {
    const grid = buildBigRoad([entry('banker'), entry('tie'), entry('banker')])
    expect(grid[0][0]).toEqual({ outcome: 'banker', tieCount: 1 })
    expect(grid[0][1]).toEqual({ outcome: 'banker', tieCount: 0 })
  })

  it('overflows to the next column at the same row after 6 in a streak (dragon tail)', () => {
    const history = Array.from({ length: 7 }, () => entry('banker'))
    const grid = buildBigRoad(history)
    expect(grid[0]).toHaveLength(6)
    expect(grid[0].every((cell) => cell?.outcome === 'banker')).toBe(true)
    expect(grid[1][5]?.outcome).toBe('banker')
    expect(grid[1][0]).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/state/bigRoad.test.ts`
Expected: FAIL — `Cannot find module './bigRoad'`.

- [ ] **Step 3: Write the pure grid builder**

```typescript
// src/renderer/src/state/bigRoad.ts
import type { HandHistoryEntry } from '@shared/types'

export interface BigRoadCell {
  outcome: 'player' | 'banker'
  tieCount: number
}

const ROWS = 6

export function buildBigRoad(history: HandHistoryEntry[]): (BigRoadCell | null)[][] {
  const grid: (BigRoadCell | null)[][] = []
  let col = -1
  let row = 0
  let lastOutcome: 'player' | 'banker' | null = null

  const ensureColumn = (c: number): void => {
    while (grid.length <= c) grid.push(new Array(ROWS).fill(null))
  }

  for (const entryItem of history) {
    if (entryItem.outcome === 'tie') {
      if (col >= 0) {
        const cell = grid[col][row]
        if (cell) cell.tieCount += 1
      }
      continue
    }

    const outcome = entryItem.outcome

    if (lastOutcome === null) {
      col = 0
      row = 0
      ensureColumn(col)
    } else if (outcome === lastOutcome) {
      if (row + 1 < ROWS) {
        row += 1
      } else {
        col += 1
        ensureColumn(col)
      }
    } else {
      col += 1
      row = 0
      ensureColumn(col)
    }

    grid[col][row] = { outcome, tieCount: 0 }
    lastOutcome = outcome
  }

  return grid
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/state/bigRoad.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing component test**

```typescript
// src/renderer/src/components/BigRoad.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { HandHistoryEntry } from '@shared/types'
import { BigRoad } from './BigRoad'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('BigRoad', () => {
  it('renders a cell per non-tie outcome', () => {
    const { container } = render(<BigRoad history={[entry('player'), entry('banker')]} />)
    expect(container.querySelectorAll('.big-road__cell--player')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__cell--banker')).toHaveLength(1)
  })

  it('marks a tie on the preceding cell instead of adding a new one', () => {
    const { container } = render(<BigRoad history={[entry('banker'), entry('tie')]} />)
    expect(container.querySelectorAll('.big-road__cell--banker')).toHaveLength(1)
    expect(container.querySelectorAll('.big-road__tie')).toHaveLength(1)
  })

  it('renders an empty board with no history', () => {
    const { container } = render(<BigRoad history={[]} />)
    expect(
      container.querySelectorAll('.big-road__cell--player, .big-road__cell--banker')
    ).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: FAIL — `Cannot find module './BigRoad'`.

- [ ] **Step 7: Write the component**

```typescript
// src/renderer/src/components/BigRoad.tsx
import type { HandHistoryEntry } from '@shared/types'
import { buildBigRoad } from '../state/bigRoad'
import './BigRoad.css'

interface BigRoadProps {
  history: HandHistoryEntry[]
}

export function BigRoad({ history }: BigRoadProps) {
  const grid = buildBigRoad(history)
  const columnCount = Math.max(grid.length, 1)

  return (
    <div className="big-road" data-testid="big-road">
      {Array.from({ length: columnCount }).map((_, colIndex) => (
        <div className="big-road__column" key={colIndex}>
          {Array.from({ length: 6 }).map((_, rowIndex) => {
            const cell = grid[colIndex]?.[rowIndex] ?? null
            return (
              <div
                key={rowIndex}
                className={`big-road__cell${cell ? ` big-road__cell--${cell.outcome}` : ''}`}
              >
                {cell && cell.tieCount > 0 && <span className="big-road__tie">/</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

```css
/* src/renderer/src/components/BigRoad.css */
.big-road {
  display: flex;
  gap: 2px;
  background: #fff;
  padding: 8px;
  border-radius: 8px;
  overflow-x: auto;
}

.big-road__column {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.big-road__cell {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #0b5e33;
}

.big-road__cell--player {
  border-color: #1a5fb4;
  color: #1a5fb4;
}

.big-road__cell--banker {
  border-color: #c0392b;
  color: #c0392b;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/components/BigRoad.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/state/bigRoad.ts src/renderer/src/state/bigRoad.test.ts src/renderer/src/components/BigRoad.tsx src/renderer/src/components/BigRoad.css src/renderer/src/components/BigRoad.test.tsx
git commit -m "feat: add Big Road scoreboard"
```

---

### Task 15: Stats panel

**Files:**
- Create: `src/renderer/src/state/stats.ts`
- Test: `src/renderer/src/state/stats.test.ts`
- Create: `src/renderer/src/components/StatsPanel.tsx`
- Create: `src/renderer/src/components/StatsPanel.css`
- Test: `src/renderer/src/components/StatsPanel.test.tsx`

**Interfaces:**
- Consumes: `HandHistoryEntry` from `@shared/types`.
- Produces: `Stats` interface, `computeStats(history): Stats`, `StatsPanel({ history })` (root has `data-testid="stats-panel"`). Used by `App.tsx` (Task 17) with `state.sessionHistory`.

- [ ] **Step 1: Write the failing test for the pure stats calculator**

```typescript
// src/renderer/src/state/stats.test.ts
import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { computeStats } from './stats'

describe('computeStats', () => {
  it('returns all zeros for empty history', () => {
    expect(computeStats([])).toEqual({
      handsPlayed: 0,
      playerWins: 0,
      bankerWins: 0,
      ties: 0,
      winRate: 0,
      netProfit: 0,
      biggestWin: 0,
      biggestLoss: 0
    })
  })

  it('tallies outcomes, win rate, net profit, and biggest win/loss', () => {
    const history: HandHistoryEntry[] = [
      { outcome: 'player', playerTotal: 9, bankerTotal: 3, netChange: 100 },
      { outcome: 'banker', playerTotal: 2, bankerTotal: 8, netChange: -50 },
      { outcome: 'tie', playerTotal: 5, bankerTotal: 5, netChange: 0 },
      { outcome: 'banker', playerTotal: 1, bankerTotal: 6, netChange: 200 }
    ]
    const stats = computeStats(history)
    expect(stats.handsPlayed).toBe(4)
    expect(stats.playerWins).toBe(1)
    expect(stats.bankerWins).toBe(2)
    expect(stats.ties).toBe(1)
    expect(stats.winRate).toBe(0.5) // 2 of 4 hands had netChange > 0
    expect(stats.netProfit).toBe(250)
    expect(stats.biggestWin).toBe(200)
    expect(stats.biggestLoss).toBe(-50)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/state/stats.test.ts`
Expected: FAIL — `Cannot find module './stats'`.

- [ ] **Step 3: Write the pure stats calculator**

```typescript
// src/renderer/src/state/stats.ts
import type { HandHistoryEntry } from '@shared/types'

export interface Stats {
  handsPlayed: number
  playerWins: number
  bankerWins: number
  ties: number
  winRate: number
  netProfit: number
  biggestWin: number
  biggestLoss: number
}

export function computeStats(history: HandHistoryEntry[]): Stats {
  const handsPlayed = history.length
  const playerWins = history.filter((h) => h.outcome === 'player').length
  const bankerWins = history.filter((h) => h.outcome === 'banker').length
  const ties = history.filter((h) => h.outcome === 'tie').length
  const winningHands = history.filter((h) => h.netChange > 0).length
  const winRate = handsPlayed > 0 ? winningHands / handsPlayed : 0
  const netProfit = history.reduce((sum, h) => sum + h.netChange, 0)
  const biggestWin = history.reduce((max, h) => (h.netChange > max ? h.netChange : max), 0)
  const biggestLoss = history.reduce((min, h) => (h.netChange < min ? h.netChange : min), 0)

  return { handsPlayed, playerWins, bankerWins, ties, winRate, netProfit, biggestWin, biggestLoss }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/state/stats.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing component test**

```typescript
// src/renderer/src/components/StatsPanel.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { HandHistoryEntry } from '@shared/types'
import { StatsPanel } from './StatsPanel'

describe('StatsPanel', () => {
  it('renders computed stats from history', () => {
    const history: HandHistoryEntry[] = [
      { outcome: 'player', playerTotal: 9, bankerTotal: 3, netChange: 100 },
      { outcome: 'banker', playerTotal: 2, bankerTotal: 8, netChange: -50 }
    ]
    render(<StatsPanel history={history} />)
    expect(screen.getByTestId('stats-panel')).toBeInTheDocument()
    expect(screen.getByText(/Hands played: 2/)).toBeInTheDocument()
    expect(screen.getByText(/Net profit: \$50\.00/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/StatsPanel.test.tsx`
Expected: FAIL — `Cannot find module './StatsPanel'`.

- [ ] **Step 7: Write the component**

```typescript
// src/renderer/src/components/StatsPanel.tsx
import type { HandHistoryEntry } from '@shared/types'
import { computeStats } from '../state/stats'
import './StatsPanel.css'

interface StatsPanelProps {
  history: HandHistoryEntry[]
}

export function StatsPanel({ history }: StatsPanelProps) {
  const stats = computeStats(history)
  return (
    <div className="stats-panel" data-testid="stats-panel">
      <div>Hands played: {stats.handsPlayed}</div>
      <div>Player wins: {stats.playerWins}</div>
      <div>Banker wins: {stats.bankerWins}</div>
      <div>Ties: {stats.ties}</div>
      <div>Win rate: {(stats.winRate * 100).toFixed(0)}%</div>
      <div>Net profit: ${stats.netProfit.toFixed(2)}</div>
      <div>Biggest win: ${stats.biggestWin.toFixed(2)}</div>
      <div>Biggest loss: ${stats.biggestLoss.toFixed(2)}</div>
    </div>
  )
}
```

```css
/* src/renderer/src/components/StatsPanel.css */
.stats-panel {
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  padding: 16px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
  font-size: 0.9rem;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/components/StatsPanel.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/state/stats.ts src/renderer/src/state/stats.test.ts src/renderer/src/components/StatsPanel.tsx src/renderer/src/components/StatsPanel.css src/renderer/src/components/StatsPanel.test.tsx
git commit -m "feat: add session stats panel"
```

---

### Task 16: Rebuy dialog

**Files:**
- Create: `src/renderer/src/components/RebuyDialog.tsx`
- Create: `src/renderer/src/components/RebuyDialog.css`
- Test: `src/renderer/src/components/RebuyDialog.test.tsx`

**Interfaces:**
- Produces: `RebuyDialog({ onAddFunds })`, root has `role="dialog"` and `aria-label="Rebuy"`. Used by `App.tsx` (Task 17).

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/components/RebuyDialog.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RebuyDialog } from './RebuyDialog'

describe('RebuyDialog', () => {
  it('resets to the starting bankroll', () => {
    const onAddFunds = vi.fn()
    render(<RebuyDialog onAddFunds={onAddFunds} />)
    screen.getByText('Reset to $1000').click()
    expect(onAddFunds).toHaveBeenCalledWith(1000)
  })

  it('disables Add Funds until a positive custom amount is entered', () => {
    render(<RebuyDialog onAddFunds={() => {}} />)
    const addButton = screen.getByText('Add Funds')
    expect(addButton).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Custom amount'), { target: { value: '250' } })
    expect(addButton).not.toBeDisabled()
  })

  it('calls onAddFunds with the custom amount and clears the input', () => {
    const onAddFunds = vi.fn()
    render(<RebuyDialog onAddFunds={onAddFunds} />)
    fireEvent.change(screen.getByPlaceholderText('Custom amount'), { target: { value: '250' } })
    screen.getByText('Add Funds').click()
    expect(onAddFunds).toHaveBeenCalledWith(250)
    expect(screen.getByPlaceholderText('Custom amount')).toHaveValue(null)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/RebuyDialog.test.tsx`
Expected: FAIL — `Cannot find module './RebuyDialog'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/components/RebuyDialog.tsx
import { useState } from 'react'
import './RebuyDialog.css'

const STARTING_BANKROLL = 1000

interface RebuyDialogProps {
  onAddFunds: (amount: number) => void
}

export function RebuyDialog({ onAddFunds }: RebuyDialogProps) {
  const [customAmount, setCustomAmount] = useState('')
  const parsedAmount = Number(customAmount)

  function handleCustomSubmit(): void {
    if (parsedAmount > 0) {
      onAddFunds(parsedAmount)
      setCustomAmount('')
    }
  }

  return (
    <div className="rebuy-dialog" role="dialog" aria-label="Rebuy">
      <p>You&apos;re out of chips.</p>
      <button type="button" onClick={() => onAddFunds(STARTING_BANKROLL)}>
        Reset to ${STARTING_BANKROLL}
      </button>
      <div className="rebuy-dialog__custom">
        <input
          type="number"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="Custom amount"
        />
        <button type="button" onClick={handleCustomSubmit} disabled={!(parsedAmount > 0)}>
          Add Funds
        </button>
      </div>
    </div>
  )
}
```

```css
/* src/renderer/src/components/RebuyDialog.css */
.rebuy-dialog {
  background: #1c1c1c;
  color: #fff;
  padding: 24px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.rebuy-dialog__custom {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/components/RebuyDialog.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RebuyDialog.tsx src/renderer/src/components/RebuyDialog.css src/renderer/src/components/RebuyDialog.test.tsx
git commit -m "feat: add rebuy dialog for when the bankroll hits zero"
```

---

### Task 17: App assembly, title bar overlay, and felt styling

**Files:**
- Create: `src/renderer/src/components/TitleBarOverlay.tsx`
- Create: `src/renderer/src/components/TitleBarOverlay.css`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/App.css`
- Test: `src/renderer/src/App.test.tsx`

**Interfaces:**
- Consumes: `GameProvider, useGame` from `./state/GameContext`; `Table` from `./components/Table`; `BigRoad` from `./components/BigRoad`; `StatsPanel` from `./components/StatsPanel`; `RebuyDialog` from `./components/RebuyDialog`.
- Produces: the assembled `App` default export, rendering `state.shoeHistory` into `BigRoad` and `state.sessionHistory` into `StatsPanel`, and `RebuyDialog` overlaid when `bankroll === 0 && phase === 'betting'`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/App.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

function mockElectronAPI(bankroll: number): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadBankroll: vi.fn().mockResolvedValue(bankroll),
      saveBankroll: vi.fn().mockResolvedValue(undefined)
    },
    writable: true
  })
}

describe('App', () => {
  it('renders the table, big road, and stats panel', async () => {
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())
    expect(screen.getByTestId('big-road')).toBeInTheDocument()
    expect(screen.getByTestId('stats-panel')).toBeInTheDocument()
  })

  it('shows the rebuy dialog when the bankroll is zero', async () => {
    mockElectronAPI(0)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Rebuy' })).toBeInTheDocument()
    })
  })

  it('hides the rebuy dialog once funds are added', async () => {
    mockElectronAPI(0)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Rebuy' })).toBeInTheDocument()
    })
    screen.getByText('Reset to $1000').click()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rebuy' })).not.toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: FAIL — `App` still renders the Task 1 placeholder `<div>Vegas Baccarat</div>`, so `getByTestId('table')` is never found and the test times out/fails.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/src/components/TitleBarOverlay.tsx
import './TitleBarOverlay.css'

export function TitleBarOverlay() {
  return <div className="title-bar-overlay" />
}
```

```css
/* src/renderer/src/components/TitleBarOverlay.css */
.title-bar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  -webkit-app-region: drag;
  z-index: 10;
}
```

```typescript
// src/renderer/src/App.tsx
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
```

```css
/* src/renderer/src/App.css */
:root {
  color-scheme: dark;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #042614;
}

.app {
  min-height: 100vh;
  padding-top: 40px;
  box-sizing: border-box;
}

.app__layout {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 24px;
  padding: 24px;
}

.app__rebuy-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm test`
Expected: all test files across every prior task pass.

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/TitleBarOverlay.tsx src/renderer/src/components/TitleBarOverlay.css src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/App.test.tsx
git commit -m "feat: assemble app shell with title bar overlay, big road, and stats"
```

---

### Task 18: macOS packaging

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` (already has the `dist:mac` script from Task 1 — verify it's present)

**Interfaces:**
- Produces: a `.app` bundle under `dist/` via `electron-builder --mac`. No custom app icon is configured in this version — electron-builder falls back to its default Electron icon; swapping in a custom `.icns` later only requires adding a `mac.icon` path to `electron-builder.yml`.

- [ ] **Step 1: Write `electron-builder.yml`**

```yaml
appId: com.vegas.baccarat-simulator
productName: Baccarat Simulator
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
mac:
  category: public.app-category.card-games
  target:
    - target: dmg
      arch:
        - arm64
        - x64
dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

- [ ] **Step 2: Confirm the `dist:mac` script exists in `package.json`**

It was added in Task 1:
```json
"dist:mac": "electron-vite build && electron-builder --mac"
```
If it's missing for any reason, add it now.

- [ ] **Step 3: Verify an unpacked build succeeds**

Run: `npm run build && npx electron-builder --mac --dir`
Expected: electron-builder completes without error.

Run: `find dist -maxdepth 2 -name "*.app"`
Expected: prints a path ending in `Baccarat Simulator.app`.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml package.json
git commit -m "feat: configure macOS packaging with electron-builder"
```

---

## Final Verification

After Task 18, run the full check sequence once more from the project root:

```bash
npm run typecheck
npm test
npm run build
```

All three must succeed with no errors before considering the plan complete.
