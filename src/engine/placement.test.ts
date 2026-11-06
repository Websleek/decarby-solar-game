import { describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE } from '../levels/level1'
import { createRoofGrid } from './grid'
import { applyPlacement, canPlacePiece, clearPieceFromGrid } from './placement'

describe('placement', () => {
  it('accepts a valid square placement at origin', () => {
    const grid = createRoofGrid(LEVEL_1_SUNNY_HOUSE)
    const preview = canPlacePiece(
      LEVEL_1_SUNNY_HOUSE,
      grid,
      { typeId: 'square', rotation: 0, instanceId: 'a' },
      { col: 0, row: 0 },
    )
    expect(preview.valid).toBe(true)
    expect(preview.cells).toHaveLength(4)
  })

  it('rejects placement that leaves the roof', () => {
    const grid = createRoofGrid(LEVEL_1_SUNNY_HOUSE)
    const preview = canPlacePiece(
      LEVEL_1_SUNNY_HOUSE,
      grid,
      { typeId: 'square', rotation: 0, instanceId: 'a' },
      { col: 7, row: 0 },
    )
    expect(preview.valid).toBe(false)
  })

  it('rejects overlapping occupied cells', () => {
    let grid = createRoofGrid(LEVEL_1_SUNNY_HOUSE)
    const first = canPlacePiece(
      LEVEL_1_SUNNY_HOUSE,
      grid,
      { typeId: 'square', rotation: 0, instanceId: 'a' },
      { col: 0, row: 0 },
    )
    grid = applyPlacement(grid, 'a', first.cells)

    const second = canPlacePiece(
      LEVEL_1_SUNNY_HOUSE,
      grid,
      { typeId: 'square', rotation: 0, instanceId: 'b' },
      { col: 1, row: 0 },
    )
    expect(second.valid).toBe(false)
  })

  it('clears a piece without affecting others', () => {
    let grid = createRoofGrid(LEVEL_1_SUNNY_HOUSE)
    grid = applyPlacement(grid, 'a', [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ])
    grid = applyPlacement(grid, 'b', [
      { col: 2, row: 0 },
      { col: 3, row: 0 },
    ])
    grid = clearPieceFromGrid(grid, 'a')
    expect(grid[0]![0]!.state).toBe('empty')
    expect(grid[0]![2]!.occupiedBy).toBe('b')
  })

  it('supports blocked cells for future levels', () => {
    const level = {
      ...LEVEL_1_SUNNY_HOUSE,
      blockedCells: [{ col: 1, row: 1 }],
    }
    const grid = createRoofGrid(level)
    const preview = canPlacePiece(
      level,
      grid,
      { typeId: 'square', rotation: 0, instanceId: 'a' },
      { col: 0, row: 0 },
    )
    expect(preview.valid).toBe(false)
  })
})
