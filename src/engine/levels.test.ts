import { describe, expect, it } from 'vitest'
import { LEVEL_3_TRICKY } from '../levels/level3'
import { LEVEL_4_MASTER, LEVEL_4_SOLUTION } from '../levels/level4'
import { listLocalLevels } from '../levels'
import { applySolution } from './applySolution'
import { analyzeLevelDifficulty } from './difficultyAnalysis'
import { createRoofGrid, getPlayableCells } from './grid'
import { canPlacePiece } from './placement'
import { inventoryCellTotal } from './pieces'
import { createPuzzleEngine } from './puzzleState'
import { maxScoreForLevel } from './scoring'
import { placementsRespectBoundaries, solveLevel } from './solver'

describe('multi-level configurations', () => {
  it('keeps unique ids and sequential numbers', () => {
    const levels = listLocalLevels()
    expect(new Set(levels.map((l) => l.id)).size).toBe(5)
    expect(levels.map((l) => l.number)).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects placement outside an L-shaped rooftop', () => {
    const grid = createRoofGrid(LEVEL_3_TRICKY)
    const preview = canPlacePiece(
      LEVEL_3_TRICKY,
      grid,
      { typeId: 'square', rotation: 0, instanceId: 'a' },
      { col: 5, row: 0 },
    )
    expect(preview.valid).toBe(false)
    expect(getPlayableCells(grid).length).toBe(inventoryCellTotal(LEVEL_3_TRICKY.inventory))
  })

  it('rejects obstacle collisions on level 4', () => {
    const grid = createRoofGrid(LEVEL_4_MASTER)
    const preview = canPlacePiece(
      LEVEL_4_MASTER,
      grid,
      { typeId: 'square', rotation: 0, instanceId: 'a' },
      { col: 2, row: 1 },
    )
    expect(preview.valid).toBe(false)
  })

  it('applies the verified level 4 solution with required rotations', () => {
    const engine = createPuzzleEngine(LEVEL_4_MASTER)
    expect(applySolution(engine, LEVEL_4_SOLUTION)).toBe(true)
    expect(engine.isComplete()).toBe(true)
    expect(LEVEL_4_SOLUTION.some((step) => step.rotation !== 0)).toBe(true)
  })

  it('solver agrees level 4 remains fully solvable', () => {
    const result = solveLevel(LEVEL_4_MASTER)
    expect(result.solvable).toBe(true)
    expect(placementsRespectBoundaries(LEVEL_4_MASTER, result.placements)).toBe(true)
  })

  it('level 4 demands more non-square pieces and rotations than level 3', () => {
    const l3 = analyzeLevelDifficulty(LEVEL_3_TRICKY)
    const l4 = analyzeLevelDifficulty(LEVEL_4_MASTER)
    expect(l4.solvable).toBe(true)
    expect(l4.nonSquarePieces).toBeGreaterThan(l3.nonSquarePieces)
    expect(l4.requiredRotations).toBeGreaterThan(0)
    expect(l4.requiredRotations).toBeGreaterThanOrEqual(l3.requiredRotations)
  })

  it('uses per-level maximum scores', () => {
    const scores = listLocalLevels().map((level) => maxScoreForLevel(level))
    expect(new Set(scores).size).toBeGreaterThan(1)
    expect(scores[0]).toBe(5500)
  })

  it('marks level 4 as puzzle version 2', () => {
    expect(LEVEL_4_MASTER.puzzleVersion).toBe(2)
  })
})
