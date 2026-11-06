import { describe, expect, it, vi } from 'vitest'
import { createStopwatch, formatStopwatch } from './stopwatch'

describe('stopwatch', () => {
  it('measures elapsed time with a monotonic clock', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1450)
    const watch = createStopwatch()
    expect(watch.elapsedMs()).toBe(450)
  })

  it('resets the origin for a fresh attempt', () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValueOnce(1000)
    const watch = createStopwatch()
    now.mockReturnValueOnce(2000)
    watch.reset()
    now.mockReturnValueOnce(2150)
    expect(watch.elapsedMs()).toBe(150)
  })

  it('formats short and long durations', () => {
    expect(formatStopwatch(1234)).toBe('1.23s')
    expect(formatStopwatch(65_432)).toBe('1:05.43')
  })
})
