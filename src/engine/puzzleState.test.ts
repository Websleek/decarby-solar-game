import { describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE, LEVEL_1_SOLUTION } from '../levels/level1'
import { LEVEL_2_CHIMNEY, LEVEL_2_SOLUTION } from '../levels/level2'
import { applySolution } from './applySolution'
import { createPuzzleEngine } from './puzzleState'
import { countOccupied } from './grid'

describe('puzzle state undo and completion', () => {
  it('places, undoes, and never duplicates pieces', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    const piece = engine.getPieces()[0]!
    expect(engine.placePiece(piece.instanceId, { col: 0, row: 0 })).toBe(true)
    expect(countOccupied(engine.getGrid())).toBe(4)
    expect(engine.getPieces().filter((p) => p.origin !== null)).toHaveLength(1)

    expect(engine.undo()).toBe(true)
    expect(countOccupied(engine.getGrid())).toBe(0)
    expect(engine.getPieces().every((p) => p.origin === null)).toBe(true)
    expect(engine.getPieces()).toHaveLength(12)
  })

  it('rejects invalid placement without changing inventory', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    const piece = engine.getPieces()[0]!
    expect(engine.placePiece(piece.instanceId, { col: 7, row: 4 })).toBe(false)
    expect(engine.getPieces().find((p) => p.instanceId === piece.instanceId)?.origin).toBeNull()
    expect(countOccupied(engine.getGrid())).toBe(0)
  })

  it('rotates tray pieces without duplicating', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    const double = engine.getPieces().find((p) => p.typeId === 'double')!
    engine.selectPiece(double.instanceId)
    expect(engine.rotateSelected()).toBe(90)
    expect(engine.getPieces().filter((p) => p.typeId === 'double')).toHaveLength(4)
  })

  it('undoes a reposition back to the prior origin', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    const piece = engine.getPieces()[0]!
    engine.placePiece(piece.instanceId, { col: 0, row: 0 })
    engine.placePiece(piece.instanceId, { col: 2, row: 0 })
    expect(engine.getPieces()[0]!.origin).toEqual({ col: 2, row: 0 })
    engine.undo()
    expect(engine.getPieces()[0]!.origin).toEqual({ col: 0, row: 0 })
    expect(countOccupied(engine.getGrid())).toBe(4)
  })

  it('restarts to a clean solvable board', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    engine.placePiece(engine.getPieces()[0]!.instanceId, { col: 0, row: 0 })
    engine.restart()
    expect(countOccupied(engine.getGrid())).toBe(0)
    expect(engine.getPieces()).toHaveLength(12)
  })

  it('detects full coverage completion with verified solution', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    expect(engine.isComplete()).toBe(true)
    expect(engine.getCoverage()).toBe(100)
    expect(engine.getPieces().every((p) => p.origin !== null)).toBe(true)
  })

  it('rejects placement on obstacles for level 2', () => {
    const engine = createPuzzleEngine(LEVEL_2_CHIMNEY)
    const piece = engine.getPieces()[0]!
    expect(engine.placePiece(piece.instanceId, { col: 6, row: 2 })).toBe(false)
  })

  it('completes level 2 with rotation-required solution', () => {
    const engine = createPuzzleEngine(LEVEL_2_CHIMNEY)
    expect(applySolution(engine, LEVEL_2_SOLUTION)).toBe(true)
    expect(engine.isComplete()).toBe(true)
  })
})
