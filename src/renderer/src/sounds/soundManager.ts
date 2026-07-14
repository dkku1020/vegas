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
