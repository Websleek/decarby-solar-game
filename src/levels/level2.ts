import type { LevelDefinition, SolutionPlacement } from '../types/game'
import { THEME_CHIMNEY } from './themes'

/**
 * Chimney Challenge — Level 2.
 * 8×5 with chimney + skylight on the right (2 blocked → 38 playable).
 * Requires one vertical double to complete a full cover.
 */
export const LEVEL_2_CHIMNEY: LevelDefinition = {
  id: 'chimney-challenge',
  number: 2,
  title: 'Chimney Challenge',
  description: 'Work around the chimney and skylight — rotate panels to fit.',
  difficulty: 'easy',
  columns: 8,
  rows: 5,
  blockedCells: [
    { col: 7, row: 2 }, // chimney
    { col: 7, row: 3 }, // skylight
  ],
  outsideCells: [],
  obstacles: [
    { kind: 'chimney', cells: [{ col: 7, row: 2 }] },
    { kind: 'skylight', cells: [{ col: 7, row: 3 }] },
  ],
  inventory: [
    { typeId: 'square', count: 7 },
    { typeId: 'double', count: 5 },
  ],
  finishThreshold: 60,
  scoring: {
    pointsPerCell: 100,
    completionBonus: 600,
    fullCoverageBonus: 1200,
    difficultyBonus: 200,
  },
  starThresholds: {
    oneStar: 60,
    twoStars: 80,
    threeStars: 95,
  },
  visualTheme: THEME_CHIMNEY,
  achievementId: 'roof-rookie',
  puzzleVersion: 1,
}

/** Verified solution — vertical double at (6,2) is required. */
export const LEVEL_2_SOLUTION: readonly SolutionPlacement[] = [
  { typeId: 'square', origin: { col: 0, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 2, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 4, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 6, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 0, row: 2 }, rotation: 0 },
  { typeId: 'square', origin: { col: 2, row: 2 }, rotation: 0 },
  { typeId: 'square', origin: { col: 4, row: 2 }, rotation: 0 },
  { typeId: 'double', origin: { col: 6, row: 2 }, rotation: 90 },
  { typeId: 'double', origin: { col: 0, row: 4 }, rotation: 0 },
  { typeId: 'double', origin: { col: 2, row: 4 }, rotation: 0 },
  { typeId: 'double', origin: { col: 4, row: 4 }, rotation: 0 },
  { typeId: 'double', origin: { col: 6, row: 4 }, rotation: 0 },
]
