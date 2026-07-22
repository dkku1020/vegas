import { describe, it, expect } from 'vitest'
import type { HandHistoryEntry } from '@shared/types'
import { analyzeLabouchereCompletions } from './analyze'

function entry(outcome: HandHistoryEntry['outcome']): HandHistoryEntry {
  return { outcome, playerTotal: 0, bankerTotal: 0, netChange: 0 }
}

describe('analyzeLabouchereCompletions', () => {
  it('returns no completions when the sequence never fully crosses off', () => {
    const history = [entry('player'), entry('player'), entry('player')]
    const completions = analyzeLabouchereCompletions(history, 'banker', [1, 2, 3, 4], 5)
    expect(completions).toEqual([])
  })

  it('records the index where the sequence completes after a win', () => {
    const history = [entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(completions).toEqual([0])
  })

  it('records every completion when the sequence resets and completes again', () => {
    const history = [entry('banker'), entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'banker', [1, 1], 5)
    expect(completions).toEqual([0, 1])
  })

  it('lets a push (tie) pass through without advancing or breaking the sequence', () => {
    const history = [entry('tie'), entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'banker', [3, 4], 5)
    expect(completions).toEqual([1])
  })

  it('tracks completions for a follow spot, skipping the first hand of the shoe', () => {
    const history = [entry('banker'), entry('banker')]
    const completions = analyzeLabouchereCompletions(history, 'follow', [3, 4], 5)
    expect(completions).toEqual([1])
  })

  it('throws when the sequence is empty, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [], 5)).toThrow()
  })

  it('throws when unit is not positive, mirroring labouchere() validation', () => {
    expect(() => analyzeLabouchereCompletions([], 'banker', [1, 2], 0)).toThrow()
  })
})
