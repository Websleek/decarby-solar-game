import { countOccupied, coveragePercent, getPlayableCells } from './grid.ts'
import type { RoofCell, VerifiableLevel } from './types.ts'

export function calculateStars(
  coverage: number,
  thresholds: VerifiableLevel['starThresholds'],
  completed: boolean,
): 0 | 1 | 2 | 3 {
  if (!completed || coverage < thresholds.oneStar) return 0
  if (coverage >= thresholds.threeStars) return 3
  if (coverage >= thresholds.twoStars) return 2
  return 1
}

export function calculateScore(
  level: VerifiableLevel,
  grid: readonly (readonly RoofCell[])[],
  completed: boolean,
): number {
  if (!completed) return 0
  const occupied = countOccupied(grid)
  const coverage = coveragePercent(grid)
  const { pointsPerCell, completionBonus, fullCoverageBonus, difficultyBonus = 0 } = level.scoring
  let score = occupied * pointsPerCell + completionBonus + difficultyBonus
  if (coverage >= 100) score += fullCoverageBonus
  const playable = getPlayableCells(grid).length
  const maxScore =
    playable * pointsPerCell + completionBonus + fullCoverageBonus + difficultyBonus
  return Math.min(score, maxScore)
}

export function canFinishDesign(
  level: VerifiableLevel,
  grid: readonly (readonly RoofCell[])[],
): boolean {
  return coveragePercent(grid) >= level.finishThreshold
}
