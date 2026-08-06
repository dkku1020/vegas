import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { analyzeLabouchereCompletions } from './analyze'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('analyzeLabouchereCompletions', () => {
  it('returns no completions when the sequence never fully crosses off', () => {
    const history = [entry('player'), entry('player'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'banker', [1, 2, 3, 4], 5)
    expect(result.completions).toEqual([])
  })

  it('records the index where the sequence completes after a win', () => {
    const history = [entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(result.completions).toEqual([0])
  })

  it('records every completion when the sequence resets and completes again', () => {
    const history = [entry('banker'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [1, 1], 5)
    expect(result.completions).toEqual([0, 1])
  })

  it('lets a push (tie) pass through without advancing or breaking the sequence', () => {
    const history = [entry('tie'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(result.completions).toEqual([1])
  })

  it('tracks completions for a follow spot, skipping the first hand of the shoe', () => {
    const history = [entry('banker'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'follow', [3, 4], 5)
    expect(result.completions).toEqual([1])
  })

  it('throws when the sequence is empty, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [], 5)).toThrow()
  })

  it('throws when unit is not positive, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [1, 2], 0)).toThrow()
  })

  it('reports skipped hands when a fixed spot loss streak hits the skip-after threshold', () => {
    const history = [entry('banker'), entry('banker'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'player', [1, 2, 3, 4], 5, 2)
    expect(result.skipped).toEqual([2])
  })

  it('does not report skipped hands when skip-after is not set', () => {
    const history = [entry('banker'), entry('banker'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'player', [1, 2, 3, 4], 5)
    expect(result.skipped).toEqual([])
  })

  it('no longer throws when skip-after is combined with a follow spot', () => {
    expect(() => analyzeLabouchereCompletions([], 'follow', [1, 2], 5, 2)).not.toThrow()
  })

  it('reports skipped hands for a follow spot loss streak, ignoring the undetermined first hand', () => {
    // Hand 0 (banker): shoeHistory is empty — no decisive predecessor, spot is undetermined,
    // not counted as a skip.
    // Hand 1 (player): shoeHistory=[banker], only 1 decisive record — countDynamicLossStreak
    // needs a predecessor-of-a-predecessor to find any loss, so streak=0. Bets banker for
    // real (loses to the actual 'player' outcome, but that's just a normal loss, not a skip).
    // Hand 2 (banker): shoeHistory=[banker, player] — follow would have predicted banker
    // (from hand 0) for hand 1, but hand 1 was player: that's 1 dynamic loss. skipAfter=1
    // means this hand sits out.
    const history = [entry('banker'), entry('player'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'follow', [1, 2, 3, 4], 5, 1)
    expect(result.skipped).toEqual([2])
  })

  it('does not report the undetermined first hand of a shoe as skipped for follow', () => {
    const history = [entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'follow', [1, 2, 3, 4], 5, 1)
    expect(result.skipped).toEqual([])
  })

  it('does not report a leading-tie hand as skipped for follow', () => {
    // sessionHistory=[tie] is non-empty but still has no decisive predecessor,
    // so hand 1's zero wager is "spot undetermined", not a skip.
    const history = [entry('tie'), entry('banker'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'follow', [1, 2, 3, 4], 5, 1)
    expect(result.skipped).toEqual([])
  })

  it('reports the starting sequence max as the peak when it is never exceeded', () => {
    const history = [entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(result.peakNumber).toBe(4)
    expect(result.peakIndex).toBeNull()
  })

  it('reports the peak number and the hand index where it was first reached', () => {
    const history = [entry('player')]
    const result = analyzeLabouchereCompletions(history, 'banker', [1, 2, 3, 4], 5)
    expect(result.peakNumber).toBe(5)
    expect(result.peakIndex).toBe(0)
  })

  it('does not move the peak index when a later sequence state does not exceed the current peak', () => {
    const history = [entry('player'), entry('banker'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'player', [1, 10], 1)
    expect(result.peakNumber).toBe(11)
    expect(result.peakIndex).toBe(1)
  })

  it('keeps tracking the peak correctly when Skip Bet After is also active', () => {
    const history = [entry('banker'), entry('banker'), entry('banker')]
    const result = analyzeLabouchereCompletions(history, 'player', [1, 2, 3, 4], 5, 1)
    expect(result.skipped).toEqual([1, 2])
    expect(result.peakNumber).toBe(5)
    expect(result.peakIndex).toBe(0)
  })

  it('reports safety-net sit-outs as skipped even when skip-after is not set, without inflating completions', () => {
    const history = [entry('banker'), entry('banker'), entry('player')]
    const result = analyzeLabouchereCompletions(history, 'banker', [3], 5, undefined, 1)
    // Hand 0: fresh [3], bets banker, wins — completes the sequence (completions: [0]).
    // Hand 1: derived sequence is now empty; shoeHistory.length (1) meets the threshold (1),
    // so the safety net blocks a fresh restart — a zero-wager sit-out, reported as skipped.
    // Hand 2: still empty (the sit-out didn't touch it), shoeHistory.length (2) still meets
    // the threshold — another sit-out, also skipped.
    // Without the completions fix below, hands 1 and 2 would ALSO be double-counted as
    // completions, since the derived sequence merely stayed empty rather than being newly
    // completed by either of them.
    expect(result.skipped).toEqual([1, 2])
    expect(result.completions).toEqual([0])
  })
})
