import { describe, expect, it } from 'vitest'
import { listLocalLevels } from '../levels'
import { createRoofGrid, getPlayableCells } from './grid'
import { inventoryCellTotal } from './pieces'
import { placementsRespectBoundaries, solveLevel } from './solver'

describe('level solvability', () => {
  const levels = listLocalLevels()

  it('registers exactly five levels', () => {
    expect(levels).toHaveLength(5)
    expect(levels.map((l) => l.number)).toEqual([1, 2, 3, 4, 5])
  })

  for (const level of levels) {
    it(`${level.id}: inventory matches playable cells`, () => {
      const playable = getPlayableCells(createRoofGrid(level)).length
      expect(inventoryCellTotal(level.inventory)).toBe(playable)
    })

    it(`${level.id}: has a verified full-coverage solution`, () => {
      const result = solveLevel(level)
      expect(result.inventoryCells).toBe(result.playableCells)
      expect(result.solvable).toBe(true)
      expect(result.placements.length).toBeGreaterThan(0)
      expect(placementsRespectBoundaries(level, result.placements)).toBe(true)
    }, 60_000)
  }
})
