import { describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE } from '../levels/level1'
import {
  createAttemptCounters,
  isPerfectRoofEligible,
  resetAttemptCounters,
} from './perfectRoof'

describe('perfect roof eligibility', () => {
  it('requires threshold coverage with zero invalids and zero hints', () => {
    const counters = createAttemptCounters()
    expect(isPerfectRoofEligible(LEVEL_1_SUNNY_HOUSE, 100, counters)).toBe(true)
    expect(isPerfectRoofEligible(LEVEL_1_SUNNY_HOUSE, 60, counters)).toBe(true)
    expect(isPerfectRoofEligible(LEVEL_1_SUNNY_HOUSE, 50, counters)).toBe(false)
  })

  it('fails after an invalid attempt, and undo does not clear history', () => {
    const counters = createAttemptCounters()
    counters.invalidAttempts = 1
    expect(isPerfectRoofEligible(LEVEL_1_SUNNY_HOUSE, 100, counters)).toBe(false)
  })

  it('fails after hint usage', () => {
    const counters = createAttemptCounters()
    counters.hintsUsed = 1
    expect(isPerfectRoofEligible(LEVEL_1_SUNNY_HOUSE, 100, counters)).toBe(false)
  })

  it('restart resets attempt counters', () => {
    const counters = createAttemptCounters()
    counters.invalidAttempts = 2
    counters.hintsUsed = 1
    resetAttemptCounters(counters)
    expect(counters).toEqual({ invalidAttempts: 0, hintsUsed: 0 })
    expect(isPerfectRoofEligible(LEVEL_1_SUNNY_HOUSE, 100, counters)).toBe(true)
  })
})
