import type { LevelDefinition, SolutionPlacement } from '../types/game'
import { THEME_MASTER } from './themes'

/**
 * Solar Puzzle Master — Level 4 (puzzleVersion 2).
 *
 * Why v1 felt easier than Level 3:
 * - Inventory was only squares + doubles, so the roof tiled with a repetitive 2×2 pattern.
 * - Two neat 2×2 obstacle blocks left rectangular corridors that squares filled automatically.
 * - The verified solution needed zero rotations.
 *
 * v2 keeps the 8×6 bounds (40 playable) but mixes squares, L groups, triples and doubles,
 * with an irregular chimney + L-shaped vent + skylight that break square-grid corridors.
 */
export const LEVEL_4_MASTER: LevelDefinition = {
  id: 'solar-puzzle-master',
  number: 4,
  title: 'Solar Puzzle Master',
  description: 'Obstacles crowd the roof — rotate, plan ahead, and watch the narrow gaps.',
  difficulty: 'hard',
  columns: 8,
  rows: 6,
  blockedCells: [
    { col: 2, row: 1 },
    { col: 3, row: 1 },
    { col: 2, row: 2 },
    { col: 3, row: 2 },
    { col: 6, row: 3 },
    { col: 6, row: 4 },
    { col: 7, row: 4 },
    { col: 0, row: 4 },
  ],
  outsideCells: [],
  obstacles: [
    {
      kind: 'chimney',
      cells: [
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
      ],
    },
    {
      kind: 'vent',
      cells: [
        { col: 6, row: 3 },
        { col: 6, row: 4 },
        { col: 7, row: 4 },
      ],
    },
    { kind: 'skylight', cells: [{ col: 0, row: 4 }] },
  ],
  inventory: [
    { typeId: 'square', count: 3 },
    { typeId: 'ell', count: 3 },
    { typeId: 'triple', count: 2 },
    { typeId: 'double', count: 5 },
  ],
  finishThreshold: 60,
  scoring: {
    pointsPerCell: 120,
    completionBonus: 800,
    fullCoverageBonus: 1600,
    difficultyBonus: 600,
  },
  starThresholds: {
    oneStar: 60,
    twoStars: 80,
    threeStars: 95,
  },
  visualTheme: THEME_MASTER,
  achievementId: 'solar-puzzle-master',
  puzzleVersion: 2,
}

/** Verified full-coverage solution (includes required rotations). Not shown to players. */
export const LEVEL_4_SOLUTION: readonly SolutionPlacement[] = [
  { typeId: 'square', origin: { col: 0, row: 0 }, rotation: 0 },
  { typeId: 'triple', origin: { col: 2, row: 0 }, rotation: 0 },
  { typeId: 'square', origin: { col: 5, row: 0 }, rotation: 0 },
  { typeId: 'double', origin: { col: 7, row: 0 }, rotation: 90 },
  { typeId: 'ell', origin: { col: 4, row: 1 }, rotation: 0 },
  { typeId: 'double', origin: { col: 0, row: 2 }, rotation: 90 },
  { typeId: 'ell', origin: { col: 1, row: 2 }, rotation: 0 },
  { typeId: 'double', origin: { col: 5, row: 2 }, rotation: 0 },
  { typeId: 'double', origin: { col: 7, row: 2 }, rotation: 90 },
  { typeId: 'ell', origin: { col: 2, row: 3 }, rotation: 180 },
  { typeId: 'square', origin: { col: 4, row: 4 }, rotation: 0 },
  { typeId: 'triple', origin: { col: 0, row: 5 }, rotation: 0 },
  { typeId: 'double', origin: { col: 6, row: 5 }, rotation: 0 },
]
