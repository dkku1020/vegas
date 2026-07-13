# Baccarat Simulator — Design Spec

Date: 2026-07-13
Status: Approved for planning

## 1. Purpose

A macOS-only Electron desktop app that simulates playing baccarat at a real
casino table: placing chip bets, watching hands play out under standard
Punto Banco rules, and managing a persistent bankroll across sessions. The
goal is a realistic, hand-by-hand casino experience (not a bulk/fast
strategy-testing tool).

## 2. Platform & Distribution

- macOS only. No Windows/Linux support planned or tested.
- Packaged as a `.dmg`/`.zip` via `electron-builder`, unsigned/ad-hoc (local
  personal use, not App Store distribution). Revisit if wider distribution is
  ever needed.

## 3. Game Rules (Punto Banco — standard casino baccarat)

- **Shoe**: 8 standard 52-card decks (416 cards) shuffled together per shoe.
  Card values: 10/J/Q/K = 0, A = 1, 2–9 = face value. Hand value = sum of
  card values mod 10.
- **Cut card**: placed ~14 cards from the end of the shoe. Once the cut card
  is crossed during a hand, that hand completes normally, then the shoe is
  reshuffled before the next hand begins (matches real casino procedure).
- **Deal**: Player and Banker each receive two cards.
  - **Natural**: if either hand totals 8 or 9 from the first two cards, no
    further cards are drawn; hand ends immediately.
  - **Player's third card**: Player draws on 0–5, stands on 6–7 (only if no
    natural).
  - **Banker's third card**: follows the standard fixed Banker-draw matrix,
    conditioned on the Banker's own two-card total and (if drawn) the
    Player's third-card value. Implemented as a lookup table in
    `engine/rules.ts`.
- **Bets available**: Player, Banker, Tie. No side bets (no Pairs) in this
  version.
- **Multiple simultaneous bets**: allowed — a player may place chips on more
  than one spot (e.g., Player and Tie) in the same hand; each settles
  independently.
- **Payouts**:
  - Player win: pays 1:1.
  - Banker win: pays 1:1 minus 5% commission, deducted immediately from the
    payout (net 0.95:1). No separate "commission box" bookkeeping.
  - Tie: pays 8:1. On a tie, existing Player and Banker bets **push** (stake
    returned, not lost) — they do not win or lose.

## 4. Bankroll & Chips

- Starting bankroll: **$1,000** (default; used both for initial app launch
  and for rebuy/reset).
- Chip denominations: **$1, $5, $25, $100, $500**.
- Table limits: minimum bet **$5**, maximum bet **$500** (per spot).
- **Persistence**: bankroll amount is saved to a local JSON file in the
  Electron `userData` directory and restored on every app launch — it
  behaves like a continuous "career" bankroll, not a per-session reset.
  Written/read only in the main process; the renderer accesses it through a
  typed `contextBridge` IPC API (no direct filesystem access from the
  renderer, preserving Electron's standard security boundary).
- **Not persisted**: shoe/card state, hand history, and session stats. Every
  app launch starts a freshly shuffled shoe and an empty scoreboard/stats
  panel; only the bankroll dollar amount carries over.
- **Going bust**: when bankroll reaches $0, betting controls disable and a
  rebuy dialog appears, offering to reset to the $1,000 starting bankroll or
  enter a custom top-up amount. Play resumes once funds are added.

## 5. Betting Interaction

- Click a chip denomination in the chip rack to select it, then click a
  betting spot (Player / Banker / Tie) to add one chip of that value to the
  stack on that spot. Repeat clicks stack more chips.
- A small remove control on each spot lets the player clear that spot's
  bet before dealing.
- A "Clear" button wipes all current bets across all spots.
- "Deal" is disabled until at least one spot has a bet meeting the $5
  table minimum, and disabled if funds are insufficient to cover the
  bets placed.
- No drag-and-drop, no Rebet/Double convenience buttons in this version.

## 6. Scoreboard — Big Road

- Standard Big Road grid tracking every hand's outcome in the current shoe:
  - Red circle = Banker win
  - Blue circle = Player win
  - Green diagonal slash marked on the existing circle = Tie (does not
    consume a new cell, per standard convention)
- Streaks flow top-to-bottom in a column; a new outcome that breaks the
  streak starts a new column to the right.
- Resets to empty at the start of every new shoe (app launch or
  post-cut-card reshuffle).

## 7. Stats Panel

Computed live from in-memory hand history for the current session (not
persisted across restarts):

- Hands played
- Player win count / Banker win count / Tie count
- Win rate
- Net profit/loss for the session
- Biggest single-hand win and biggest single-hand loss

## 8. Visual & Audio Style

- **Realistic casino table**: green felt table texture, defined betting
  circles/spots for Player/Banker/Tie, stacked casino-style chip graphics,
  animated card dealing (flip/slide), polished skeuomorphic look.
- **Window chrome**: custom immersive title bar using Electron's
  `hiddenInset` title bar style — traffic-light buttons overlaid directly on
  the felt background rather than a standard title bar, for an immersive
  native-feeling window.
- **Sound effects**: card deal/flip sounds, chip placement sounds, and a
  win/lose chime. Played via plain HTML `<audio>` or a lightweight helper —
  no heavy audio library needed.
- **Animation**: CSS transitions/keyframes for card deals and chip
  placement. A JS animation library (e.g. Framer Motion) is a fallback only
  if CSS choreography proves insufficient for the deal sequence — not part
  of the initial build.

## 9. Technical Architecture

```
src/
  main/                    # Electron main process
    index.ts               # app lifecycle, BrowserWindow (hiddenInset titlebar)
    persistence.ts         # read/write save file in userData dir
    preload.ts              # contextBridge: exposes typed IPC API to renderer
  renderer/                # React app
    engine/                # pure TS, no React/DOM dependency
      shoe.ts              # 8-deck shoe: build, shuffle, cut-card, draw
      rules.ts             # third-card drawing rules, hand value calc
      payouts.ts           # settle bets given outcome, commission, tie push
      engine.test.ts        # unit tests: naturals, draw-table branches,
                             # tie-push, commission rounding
    state/
      GameContext.tsx       # useReducer + Context: bankroll, bets, shoe,
                             # history, stats
    components/
      Table.tsx             # felt table, betting spots, layout
      Chip.tsx / ChipRack.tsx
      Card.tsx / Hand.tsx    # card rendering + deal animation
      BigRoad.tsx            # scoreboard grid
      StatsPanel.tsx
      RebuyDialog.tsx
      TitleBarOverlay.tsx    # traffic-light-safe drag region
    sounds/                 # deal, chip, win/lose chime assets
  shared/
    types.ts                # Bet, HandResult, SaveData, etc., shared
                             # between main and renderer
```

- **Stack**: TypeScript + React, built/served via `electron-vite`.
- **State management**: `useReducer` + React Context — no Redux/Zustand;
  scope doesn't warrant it.
- **Rules engine isolation**: the `engine/` module is pure TypeScript with
  no React or DOM dependency, so shoe/dealing/payout logic is independently
  unit-testable and fully decoupled from rendering. React state calls into
  this engine and renders its results; it does not reimplement any rules.
- **IPC boundary**: renderer never touches Node/filesystem APIs directly;
  all persistence goes through a typed API exposed via `contextBridge` in
  `preload.ts`.

## 10. Explicitly Out of Scope (this version)

- Pair side bets (Player Pair / Banker Pair).
- Chemin de Fer or any non-Punto-Banco variant.
- Fast/bulk auto-play or strategy-testing mode.
- Commission-box style deferred commission bookkeeping.
- Drag-and-drop chip placement; Rebet/Double buttons.
- Cross-platform support (Windows/Linux).
- Notarized/signed distribution or App Store packaging.
- Persisting shoe state, hand history, or stats across app restarts.
