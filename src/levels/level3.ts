import type { GridCoord, LevelDefinition } from '../types/game'
import { THEME_TRICKY } from './themes'

/** L-shaped playable roof inside an 8×6 bounds: cut away the top-right block. */
function buildLOutside(): GridCoord[] {
  const cells: GridCoord[] = []
  for (let row = 0; row < 3; row += 1) {
    for (let col = 4; col < 8; col += 1) {
      cells.push({ col, row })
    }
  }
  return cells
}

/**
 * Tricky Rooftop — Level 3.
 * L-shaped playable area (36 cells) with singles, doubles, triples, squares and L groups.
 */
export const LEVEL_3_TRICKY: LevelDefinition = {
  id: 'tricky-rooftop',
  number: 3,
  title: 'Tricky Rooftop',
  description: 'An L-shaped roof that rewards careful planning and L-shaped panels.',
  difficulty: 'medium',
  columns: 8,
  rows: 6,
  blockedCells: [],
  outsideCells: buildLOutside(),
  obstacles: [],
  inventory: [
    { typeId: 'square', count: 4 },
    { typeId: 'ell', count: 2 },
    { typeId: 'triple', count: 2 },
    { typeId: 'double', count: 3 },
  ],
  finishThreshold: 60,
  scoring: {
    pointsPerCell: 110,
    completionBonus: 700,
    fullCoverageBonus: 1400,
    difficultyBonus: 400,
  },
  starThresholds: {
    oneStar: 60,
    twoStars: 80,
    threeStars: 95,
  },
  visualTheme: THEME_TRICKY,
  achievementId: 'solar-designer',
  puzzleVersion: 1,
}
