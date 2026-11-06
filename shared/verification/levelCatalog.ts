import type { VerifiableLevel } from './types.ts'
import { hashLevelConfiguration } from './hash.ts'

/** Approved puzzle configs used by server-side replay (no visual/theme fields). */
export const APPROVED_LEVELS: readonly VerifiableLevel[] = [
  {
    id: 'sunny-house',
    puzzleVersion: 1,
    columns: 8,
    rows: 5,
    blockedCells: [],
    outsideCells: [],
    inventory: [
      { typeId: 'square', count: 8 },
      { typeId: 'double', count: 4 },
    ],
    finishThreshold: 60,
    scoring: { pointsPerCell: 100, completionBonus: 500, fullCoverageBonus: 1000 },
    starThresholds: { oneStar: 60, twoStars: 80, threeStars: 95 },
  },
  {
    id: 'chimney-challenge',
    puzzleVersion: 1,
    columns: 8,
    rows: 5,
    blockedCells: [
      { col: 7, row: 2 },
      { col: 7, row: 3 },
    ],
    outsideCells: [],
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
    starThresholds: { oneStar: 60, twoStars: 80, threeStars: 95 },
  },
  {
    id: 'tricky-rooftop',
    puzzleVersion: 1,
    columns: 8,
    rows: 6,
    blockedCells: [],
    outsideCells: [
      { col: 4, row: 0 },
      { col: 5, row: 0 },
      { col: 6, row: 0 },
      { col: 7, row: 0 },
      { col: 4, row: 1 },
      { col: 5, row: 1 },
      { col: 6, row: 1 },
      { col: 7, row: 1 },
      { col: 4, row: 2 },
      { col: 5, row: 2 },
      { col: 6, row: 2 },
      { col: 7, row: 2 },
    ],
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
    starThresholds: { oneStar: 60, twoStars: 80, threeStars: 95 },
  },
  {
    id: 'solar-puzzle-master',
    puzzleVersion: 2,
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
    starThresholds: { oneStar: 60, twoStars: 80, threeStars: 95 },
  },
  {
    id: 'decarby-solar-champion',
    puzzleVersion: 1,
    columns: 10,
    rows: 6,
    blockedCells: [
      { col: 4, row: 2 },
      { col: 5, row: 2 },
      { col: 4, row: 3 },
      { col: 2, row: 4 },
    ],
    outsideCells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 8, row: 0 },
      { col: 9, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 8, row: 1 },
      { col: 9, row: 1 },
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
    starThresholds: { oneStar: 60, twoStars: 80, threeStars: 95 },
  },
] as const

export function getApprovedLevel(levelId: string, puzzleVersion: number): VerifiableLevel | null {
  return (
    APPROVED_LEVELS.find((level) => level.id === levelId && level.puzzleVersion === puzzleVersion) ??
    null
  )
}

export function approvedHashFor(levelId: string, puzzleVersion: number): string | null {
  const level = getApprovedLevel(levelId, puzzleVersion)
  return level ? hashLevelConfiguration(level) : null
}
