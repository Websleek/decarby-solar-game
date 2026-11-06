import type { LevelResult, TimeAttackResult } from '../types/game'

export function classicResult(
  partial: Partial<LevelResult> & Pick<LevelResult, 'levelId' | 'score' | 'stars'>,
): LevelResult {
  return {
    coveragePercent: 100,
    occupiedCells: 40,
    playableCells: 40,
    durationMs: 30_000,
    isPerfect: true,
    completed: true,
    achievements: [],
    mode: 'classic',
    invalidAttempts: 0,
    hintsUsed: 0,
    perfectRoof: false,
    isNewScoreBest: true,
    ...partial,
  }
}

export function timeAttackResult(
  partial: Partial<TimeAttackResult> & Pick<TimeAttackResult, 'levelId' | 'durationMs'>,
): TimeAttackResult {
  return {
    previousBestMs: null,
    isNewPersonalBest: true,
    coveragePercent: 100,
    ...partial,
  }
}
