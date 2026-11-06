import type { GridCoord, LevelDefinition } from '../types/game'
import { THEME_CHAMPION } from './themes'

/** Cut top corner notches from a 10×6 roof (8 outside + 4 blocked → 48 playable). */
function buildChampionOutside(): GridCoord[] {
  const cells: GridCoord[] = []
  for (const row of [0, 1]) {
    for (const col of [0, 1, 8, 9]) {
      cells.push({ col, row })
    }
  }
  return cells
}

/**
 * Decarby Solar Champion — Level 5.
 * 10×6 bounds, notched corners + obstacles → 48 playable cells.
 */
export const LEVEL_5_CHAMPION: LevelDefinition = {
  id: 'decarby-solar-champion',
  number: 5,
  title: 'Decarby Solar Champion',
  description: 'The ultimate rooftop — notches, obstacles and every panel shape.',
  difficulty: 'expert',
  columns: 10,
  rows: 6,
  blockedCells: [
    { col: 4, row: 2 },
    { col: 5, row: 2 },
    { col: 4, row: 3 },
    { col: 2, row: 4 },
  ],
  outsideCells: buildChampionOutside(),
  obstacles: [
    {
      kind: 'chimney',
      cells: [
        { col: 4, row: 2 },
        { col: 5, row: 2 },
        { col: 4, row: 3 },
      ],
    },
    { kind: 'skylight', cells: [{ col: 2, row: 4 }] },
  ],
  inventory: [
    { typeId: 'square', count: 6 },
    { typeId: 'ell', count: 3 },
    { typeId: 'triple', count: 4 },
  ],
  finishThreshold: 60,
  scoring: {
    pointsPerCell: 130,
    completionBonus: 1000,
    fullCoverageBonus: 2000,
    difficultyBonus: 1000,
  },
  starThresholds: {
    oneStar: 60,
    twoStars: 80,
    threeStars: 95,
  },
  visualTheme: THEME_CHAMPION,
  achievementId: 'decarby-solar-champion',
  puzzleVersion: 1,
}
