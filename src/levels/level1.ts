import type { LevelDefinition, SolutionPlacement } from '../types/game'
import { THEME_SUNNY } from './themes'

/**
 * Sunny House — Level 1 beginner rooftop.
 * Spec grid: 8×5 = 40 playable cells.
 * Inventory: 8 squares (2×2) + 4 doubles. Max score: 5,500.
 */
export const LEVEL_1_SUNNY_HOUSE: LevelDefinition = {
  id: 'sunny-house',
  number: 1,
  title: 'Sunny House',
  description: 'A simple rectangular rooftop — perfect for learning the basics.',
  difficulty: 'beginner',
  columns: 8,
  rows: 5,
  blockedCells: [],
  outsideCells: [],
  obstacles: [],
  inventory: [
    { typeId: 'square', count: 8 },
    { typeId: 'double', count: 4 },
  ],
  finishThreshold: 60,
  scoring: {
    pointsPerCell: 100,
    completionBonus: 500,
    fullCoverageBonus: 1000,
  },
  starThresholds: {
    oneStar: 60,
    twoStars: 80,
    threeStars: 95,
  },
  visualTheme: THEME_SUNNY,
  achievementId: 'solar-starter',
  puzzleVersion: 1,
}

/**
 * Verified full-coverage solution (piece order matches inventory build order:
 * squares 1–8, then doubles 9–12). Rotations default to 0.
 */
export const LEVEL_1_SOLUTION: readonly SolutionPlacement[] = [
  { typeId: 'square', origin: { col: 0, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 2, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 4, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 6, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 0, row: 2 }, rotation: 0 },
  { typeId: 'square', origin: { col: 2, row: 2 }, rotation: 0 },
  { typeId: 'square', origin: { col: 4, row: 2 }, rotation: 0 },
  { typeId: 'square', origin: { col: 6, row: 2 }, rotation: 0 },
  { typeId: 'double', origin: { col: 0, row: 4 }, rotation: 0 },
  { typeId: 'double', origin: { col: 2, row: 4 }, rotation: 0 },
  { typeId: 'double', origin: { col: 4, row: 4 }, rotation: 0 },
  { typeId: 'double', origin: { col: 6, row: 4 }, rotation: 0 },
]
