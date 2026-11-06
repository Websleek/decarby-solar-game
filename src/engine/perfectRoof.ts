import type { LevelDefinition } from '../types/game'

export type AttemptCounters = {
  invalidAttempts: number
  hintsUsed: number
}

export function createAttemptCounters(): AttemptCounters {
  return { invalidAttempts: 0, hintsUsed: 0 }
}

export function resetAttemptCounters(counters: AttemptCounters): void {
  counters.invalidAttempts = 0
  counters.hintsUsed = 0
}

/**
 * Perfect Roof: meet the level finish threshold with zero invalid attempts
 * and zero hint usage. Undo does not clear counters; Restart does.
 */
export function isPerfectRoofEligible(
  level: LevelDefinition,
  coveragePercent: number,
  counters: AttemptCounters,
): boolean {
  return (
    coveragePercent >= level.finishThreshold &&
    counters.invalidAttempts === 0 &&
    counters.hintsUsed === 0
  )
}
