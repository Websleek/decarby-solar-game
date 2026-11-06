import type { GameMode, LevelDefinition, LevelResult, RoofCell } from '../types/game'
import { countOccupied, coveragePercent, getPlayableCells } from './grid'
import { isPerfectRoofEligible, type AttemptCounters } from './perfectRoof'

export function calculateStars(
  coverage: number,
  thresholds: LevelDefinition['starThresholds'],
  completed: boolean,
): 0 | 1 | 2 | 3 {
  if (!completed || coverage < thresholds.oneStar) return 0
  if (coverage >= thresholds.threeStars) return 3
  if (coverage >= thresholds.twoStars) return 2
  return 1
}

/**
 * Score is derived from the final validated board only — never from drag events.
 * Blocked / outside cells never contribute coverage or points.
 */
export function calculateScore(
  level: LevelDefinition,
  grid: readonly (readonly RoofCell[])[],
  completed: boolean,
): number {
  if (!completed) return 0

  const occupied = countOccupied(grid)
  const coverage = coveragePercent(grid)
  const { pointsPerCell, completionBonus, fullCoverageBonus, difficultyBonus = 0 } = level.scoring

  let score = occupied * pointsPerCell + completionBonus + difficultyBonus
  if (coverage >= 100) {
    score += fullCoverageBonus
  }

  const playable = getPlayableCells(grid).length
  const maxScore =
    playable * pointsPerCell + completionBonus + fullCoverageBonus + difficultyBonus

  return Math.min(score, maxScore)
}

export function maxScoreForLevel(level: LevelDefinition): number {
  const playable =
    level.columns * level.rows - level.blockedCells.length - level.outsideCells.length
  const { pointsPerCell, completionBonus, fullCoverageBonus, difficultyBonus = 0 } = level.scoring
  return playable * pointsPerCell + completionBonus + fullCoverageBonus + difficultyBonus
}

export type BuildResultOptions = {
  mode?: GameMode
  counters?: AttemptCounters
  previousBestScore?: number
}

export function buildLevelResult(
  level: LevelDefinition,
  grid: readonly (readonly RoofCell[])[],
  durationMs: number,
  completed: boolean,
  options: BuildResultOptions = {},
): LevelResult {
  const playableCells = getPlayableCells(grid).length
  const occupiedCells = countOccupied(grid)
  const coverage = coveragePercent(grid)
  const isPerfect = completed && coverage >= 100
  const stars = calculateStars(coverage, level.starThresholds, completed)
  const score = calculateScore(level, grid, completed)
  const mode = options.mode ?? 'classic'
  const counters = options.counters ?? { invalidAttempts: 0, hintsUsed: 0 }
  const perfectRoof =
    completed && mode === 'classic' && isPerfectRoofEligible(level, coverage, counters)

  const achievements: string[] = []
  if (completed) {
    achievements.push(level.achievementId)
    if (perfectRoof) achievements.push('perfect-roof')
  }

  const previousBest = options.previousBestScore ?? 0
  const isNewScoreBest = completed && score > previousBest

  return {
    levelId: level.id,
    score,
    stars,
    coveragePercent: coverage,
    occupiedCells,
    playableCells,
    durationMs,
    isPerfect,
    completed,
    achievements,
    mode,
    invalidAttempts: counters.invalidAttempts,
    hintsUsed: counters.hintsUsed,
    perfectRoof,
    isNewScoreBest,
  }
}

export function canFinishDesign(
  level: LevelDefinition,
  grid: readonly (readonly RoofCell[])[],
): boolean {
  return coveragePercent(grid) >= level.finishThreshold
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
