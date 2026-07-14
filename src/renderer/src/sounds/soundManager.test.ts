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
