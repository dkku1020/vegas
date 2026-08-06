# Sequence Safety Net — Design

## Context

The Labouchere strategy (`labouchere()` in `src/renderer/src/engine/strategy.ts`)
restarts its betting sequence from scratch every time the current one
completes (wins down to nothing). Near the end of a shoe this is risky: a
freshly-started sequence can get cut off mid-progression when the shoe ends
(the cut card is hit — see `2026-07-16-finish-shoe-design.md`), or simply
leaves less runway to recover if it goes badly. This adds an opt-in
**"safety net"**: past a configurable number of hands played in the current
shoe, stop starting *new* sequences — but let any sequence already in
progress run to completion normally, uninterrupted.

Example: threshold = 50. Hands 1-50 (in this shoe) can freely start a new
sequence whenever the previous one completes. From hand 51 onward, if a
sequence completes, the strategy sits out (bets nothing) for the rest of
the shoe instead of restarting. If a sequence is still mid-progression when
hand 50 passes, it keeps going exactly as before — the safety net has
nothing to block until *that* sequence eventually completes.

This is a natural companion to the existing "skip bet after N losses"
option (`2026-08-05-skip-bet-after-design.md`,
`2026-08-06-skip-bet-after-follow-counter-design.md`): both are opt-in
risk-management rules layered on top of the base Labouchere strategy, and
both are exposed the same way in the UI.

## Behavior

- `noNewSequenceAfter` is an optional positive integer, independent of
  `skipAfter` and independent of `spotMode` (applies identically to
  `'player'`, `'banker'`, `'follow'`, and `'counter'` — no spot-based
  restriction, unlike `skipAfter`'s original player/banker-only rule
  before it was extended).
- **Trigger condition:** a new sequence is about to start (the derived
  sequence has just collapsed to empty, meaning the previous sequence's
  final bet won) **and** `context.shoeHistory.length >= noNewSequenceAfter`
  — i.e. this many hands have already been played in the *current* shoe.
  When both hold, the strategy returns an all-zero `Bets` for that hand
  instead of restarting from `initialSequence`.
- **Boundary:** with the threshold set to 50, hands 1-50 (`shoeHistory.length`
  0 through 49 at decision time) can still start fresh. Hand 51 onward
  (`shoeHistory.length >= 50`) cannot.
- **In-progress sequences are never interrupted.** The trigger only checks
  when the derived sequence is empty — which happens exactly once, right
  when a sequence completes. A sequence that's mid-progression when the
  threshold is crossed keeps betting normally with no special-casing; the
  safety net has no effect on it until it eventually completes.
- **Once triggered, it holds for the rest of the shoe.** A zero-wager hand
  never advances or regresses the derived sequence (`deriveLabouchereSequence`
  already skips zero-wager records), so every subsequent hand in that shoe
  still sees an empty sequence and sits out again. The strategy only bets
  again once a new shoe starts (`shoeHistory` resets to `[]`, so the count
  restarts at 0).
- **Per-shoe, not per-session.** `context.shoeHistory` already resets on
  every new shoe in both `simulateSession` and the Analyze tab's
  single-shoe history — reusing it for this check means the reset falls
  out for free, exactly like the `skipAfter` loss-streak scoping already
  does.
- **Composes with `skipAfter` independently.** The two options don't
  interact — a hand can be blocked by either, both, or neither. No
  combined validation or special-casing needed between them.

## Core engine changes (`strategy.ts`)

- `labouchere(spotMode, sequence, unit, skipAfter?, noNewSequenceAfter?): Strategy`
- New validation, alongside the existing `skipAfter` check:
  ```ts
  if (noNewSequenceAfter !== undefined) {
    if (!Number.isInteger(noNewSequenceAfter) || noNewSequenceAfter <= 0) {
      throw new Error(`No-new-sequence-after must be a positive integer, got ${noNewSequenceAfter}`)
    }
  }
  ```
- The existing fallback block:
  ```ts
  let current = deriveLabouchereSequence(initialSequence, unit, context.sessionHistory)
  if (current.length === 0) {
    current = initialSequence
  }
  ```
  becomes:
  ```ts
  let current = deriveLabouchereSequence(initialSequence, unit, context.sessionHistory)
  if (current.length === 0) {
    if (noNewSequenceAfter !== undefined && context.shoeHistory.length >= noNewSequenceAfter) {
      return { player: 0, banker: 0, tie: 0 }
    }
    current = initialSequence
  }
  ```
  This sits before the existing `spot === null` check and the `skipAfter`
  check further down — order between these three early-return checks
  doesn't change behavior (they're all just "return zero bets"), so this
  is placed where the fallback used to live, the natural spot for it.

## `analyze.ts` changes

- `analyzeLabouchereCompletions(history, spotMode, sequence, unit, skipAfter?, noNewSequenceAfter?)`
  — the new param is threaded into the `labouchere(...)` call.
- **One existing line must change.** The current skipped-hand check is:
  ```ts
  if (skipAfter !== undefined && totalWagered === 0 && hasResolvableSpot) {
    skipped.push(i)
  }
  ```
  This is gated on `skipAfter !== undefined` — so if only
  `noNewSequenceAfter` is set (no `skipAfter`), a safety-net sit-out would
  produce `totalWagered === 0` but silently fail to be recorded, since the
  outer condition never becomes true. This must widen to:
  ```ts
  if (
    (skipAfter !== undefined || noNewSequenceAfter !== undefined) &&
    totalWagered === 0 &&
    hasResolvableSpot
  ) {
    skipped.push(i)
  }
  ```
  With that fix, `hasResolvableSpot` still does the right thing for both
  triggers without further change — and not just as a matter of the
  threshold being large in practice, but structurally: `noNewSequenceAfter`
  can only ever trigger on a hand where the derived sequence has just
  collapsed to empty, which only happens right after a *wagered* bet won.
  For `'follow'`/`'counter'`, placing that wagered bet in the first place
  required `resolveDynamicSpot` to have resolved a non-null spot, which
  itself required a prior non-tie outcome in the shoe. So by construction,
  any hand where the safety net can fire already has at least one non-tie
  outcome on record — `hasResolvableSpot` is unavoidably `true` there,
  regardless of how low the configured threshold is. So every
  safety-net-triggered zero-wager hand is correctly reported as `skipped`
  once the gating condition above is widened. This was a deliberate design
  goal confirmed during brainstorming: safety-net sit-outs render with the
  exact same dimmed styling as loss-streak skips, merged into the same
  count — no new visual category.

- **A second, pre-existing bug surfaces here and must be fixed alongside
  the above.** The completion-tracking block is:
  ```ts
  const remaining = deriveLabouchereSequence(initialSequence, unit, sessionHistory)
  if (remaining.length === 0) {
    completions.push(i)
  } else {
    ...peak tracking...
  }
  ```
  `deriveLabouchereSequence` returns whatever the sequence currently is —
  it doesn't distinguish "this hand just completed it" from "the sequence
  has been empty for a while and this hand didn't touch it." Zero-wager
  hands (`wager <= 0`) are `continue`d inside `deriveLabouchereSequence`
  without resetting `sequence`, so once a completion empties it, *every*
  subsequent zero-wager hand also sees `remaining.length === 0` and gets
  pushed onto `completions` again — over-reporting "sequence completed N
  times" once per sit-out hand, not once per actual completion. This has
  always been latent (it could already misfire after a `skipAfter`
  sit-out), but no existing test exercises a completion immediately
  followed by a sit-out, so it's never surfaced. The safety net makes it
  surface constantly, by design — it exists specifically to produce long
  strings of sit-out hands right after a completion. Fix, in the same
  block:
  ```ts
  if (remaining.length === 0) {
    if (totalWagered > 0) {
      completions.push(i)
    }
  } else {
    ...peak tracking, unchanged...
  }
  ```
  A completion can only genuinely happen on the hand that wagered and won
  it; a zero-wager hand can never cause one, so gating on `totalWagered > 0`
  (already computed above this block for the skipped-hand check) is exact,
  not a heuristic. The peak-tracking `else` branch is untouched — it was
  never affected by this bug (it only runs when `remaining.length > 0`,
  wager-count-independent).

## UI changes

### `SimulatePanel.tsx` / `AnalyzePanel.tsx`

- New state `noNewSequenceAfter: string`, parsed with a new
  `parseNoNewSequenceAfter` helper — same shape as the existing
  `parseSkipAfter` in each file (blank → `undefined`; non-blank must be a
  positive integer or it throws
  `` `No new sequence after must be a positive integer, got "${text}"` ``,
  surfaced through the existing try/catch → `setError` path).
- New field "No new sequence after (hands)", rendered wherever the
  Labouchere strategy/spot selector is already showing — **not** gated on
  spot mode (applies to all four). In `SimulatePanel.tsx` that means
  alongside the existing Labouchere-only fields (still hidden for Flat
  Bet); in `AnalyzePanel.tsx` it's always visible (there's only the
  Labouchere strategy today).
- Passed through unconditionally into the `labouchere(...)` /
  `analyzeLabouchereCompletions(...)` calls, positioned after the existing
  `skipAfter` argument.
- No results-panel changes beyond what's already there — Analyze's
  existing `skipped`/dimmed-cell rendering picks up safety-net sit-outs
  automatically (see `analyze.ts` section above); Simulate has no
  per-hand board to annotate.

## Files touched

1. `src/renderer/src/engine/strategy.ts` — `labouchere()` new param,
   validation, updated fallback block.
2. `src/renderer/src/engine/strategy.test.ts` — blocks a new sequence past
   the threshold; does not interrupt an in-progress sequence past the
   threshold; allows starting fresh below the threshold; stays blocked for
   the rest of the shoe once triggered; resets at a new shoe boundary;
   composes independently with `skipAfter`; validation errors.
3. `src/renderer/src/engine/analyze.ts` — thread the new param through.
4. `src/renderer/src/engine/analyze.test.ts` — a safety-net-triggered hand
   is reported in `skipped` when only `noNewSequenceAfter` is set (no
   `skipAfter`); a completion followed by one or more safety-net sit-out
   hands reports exactly one completion, not one per sit-out hand
   (covers the `totalWagered > 0` fix above).
5. `src/renderer/src/components/SimulatePanel.tsx` — new field, parsing,
   pass-through.
6. `src/renderer/src/components/SimulatePanel.test.tsx` — field visible
   for Labouchere regardless of spot, hidden for Flat Bet, end-to-end run
   with the field set, validation error surfaced.
7. `src/renderer/src/components/AnalyzePanel.tsx` — same field, parsing,
   pass-through.
8. `src/renderer/src/components/AnalyzePanel.test.tsx` — field visible,
   end-to-end run showing the safety-net sit-out as a skipped/dimmed hand,
   validation error surfaced.

## Known tradeoff

None new — the check added to `strategy.ts`'s per-hand closure is O(1)
(`context.shoeHistory.length` is an array length read), and the
`analyze.ts` change is a pure pass-through with no new logic.
