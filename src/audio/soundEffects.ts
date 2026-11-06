export type SoundEffectId =
  | 'place'
  | 'invalid'
  | 'rotate'
  | 'complete'
  | 'achievement'
  | 'personalBest'
  | 'hint'

type Tone = { freq: number; duration: number; type?: OscillatorType; gain?: number }

const PATTERNS: Record<SoundEffectId, Tone[]> = {
  place: [{ freq: 520, duration: 0.07, type: 'triangle', gain: 0.04 }],
  invalid: [{ freq: 180, duration: 0.12, type: 'square', gain: 0.03 }],
  rotate: [{ freq: 380, duration: 0.05, type: 'sine', gain: 0.035 }],
  complete: [
    { freq: 523, duration: 0.1, type: 'triangle', gain: 0.045 },
    { freq: 659, duration: 0.12, type: 'triangle', gain: 0.04 },
    { freq: 784, duration: 0.18, type: 'triangle', gain: 0.04 },
  ],
  achievement: [
    { freq: 660, duration: 0.08, type: 'sine', gain: 0.04 },
    { freq: 880, duration: 0.14, type: 'sine', gain: 0.04 },
  ],
  personalBest: [
    { freq: 740, duration: 0.09, type: 'triangle', gain: 0.045 },
    { freq: 988, duration: 0.16, type: 'triangle', gain: 0.04 },
  ],
  hint: [{ freq: 440, duration: 0.08, type: 'sine', gain: 0.03 }],
}

let audioCtx: AudioContext | null = null
let unlocked = false

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
  }
  return audioCtx
}

/** Call from a user gesture so browsers allow audio. */
export async function unlockAudio(): Promise<void> {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return
    }
  }
  unlocked = true
}

function playTone(ctx: AudioContext, tone: Tone, when: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = tone.type ?? 'sine'
  osc.frequency.value = tone.freq
  const volume = tone.gain ?? 0.04
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + tone.duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(when)
  osc.stop(when + tone.duration + 0.02)
}

export function playSound(id: SoundEffectId, enabled: boolean): void {
  if (!enabled || !unlocked) return
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return
  const pattern = PATTERNS[id]
  let t = ctx.currentTime
  for (const tone of pattern) {
    playTone(ctx, tone, t)
    t += tone.duration * 0.85
  }
}
