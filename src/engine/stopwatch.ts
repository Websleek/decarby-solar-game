/** Monotonic elapsed-time helper (performance.now). */
export type Stopwatch = {
  elapsedMs(): number
  reset(): void
  startedAt(): number
}

export function createStopwatch(): Stopwatch {
  let origin = performance.now()
  return {
    elapsedMs() {
      return Math.max(0, performance.now() - origin)
    },
    reset() {
      origin = performance.now()
    },
    startedAt() {
      return origin
    },
  }
}

export function formatStopwatch(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms))
  const minutes = Math.floor(totalMs / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const hundredths = Math.floor((totalMs % 1000) / 10)
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths
      .toString()
      .padStart(2, '0')}`
  }
  return `${seconds}.${hundredths.toString().padStart(2, '0')}s`
}
