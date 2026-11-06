import { describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE, LEVEL_1_SOLUTION } from '../levels/level1'
import { applySolution } from './applySolution'
import { cloneGrid } from './grid'
import { requestHint, solveRemaining } from './hint'
import { createPuzzleEngine } from './puzzleState'

describe('smart hints', () => {
  it('suggests a valid placement from a completable board', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    const hint = requestHint(engine)
    expect(hint.kind).toBe('suggestion')
    if (hint.kind !== 'suggestion') return

    let guard = 0
    while (
      engine.getPieces().find((p) => p.instanceId === hint.suggestion.pieceId)?.rotation !==
        hint.suggestion.rotation &&
      guard < 4
    ) {
      engine.rotatePiece(hint.suggestion.pieceId)
      guard += 1
    }

    expect(engine.placePiece(hint.suggestion.pieceId, hint.suggestion.origin)).toBe(true)
    expect(hint.suggestion.cells.length).toBeGreaterThan(0)
  })

  it('suggests a continuation after a valid partial layout', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION.slice(0, 3))).toBe(true)
    const hint = requestHint(engine)
    expect(hint.kind).toBe('suggestion')
  })

  it('reports already complete roofs', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    const hint = requestHint(engine)
    expect(hint.kind).toBe('alreadyComplete')
    if (hint.kind === 'alreadyComplete') {
      expect(hint.message.toLowerCase()).toContain('fully')
    }
  })

  it('handles unsolvable remainders without inventing a placement', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    const grid = cloneGrid(engine.getGrid())
    expect(solveRemaining(LEVEL_1_SUNNY_HOUSE, grid, ['ell', 'ell', 'ell'])).toBeNull()

    // Strand the board: cover with a known prefix, then place a square into a cell that
    // breaks exact cover for the remaining doubles/squares.
    expect(applySolution(engine, LEVEL_1_SOLUTION.slice(0, 4))).toBe(true)
    const freeSquare = engine.getPieces().find((p) => p.origin === null && p.typeId === 'square')
    if (!freeSquare) return
    // Try origins until we either stay solvable (suggestion) or become unsolvable.
    let sawUnsolvable = false
    for (let row = 0; row < LEVEL_1_SUNNY_HOUSE.rows; row += 1) {
      for (let col = 0; col < LEVEL_1_SUNNY_HOUSE.columns; col += 1) {
        const probe = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
        expect(applySolution(probe, LEVEL_1_SOLUTION.slice(0, 4))).toBe(true)
        const piece = probe.getPieces().find((p) => p.origin === null && p.typeId === 'square')
        if (!piece) continue
        if (!probe.placePiece(piece.instanceId, { col, row })) continue
        const hint = requestHint(probe)
        if (hint.kind === 'unsolvable') {
          sawUnsolvable = true
          expect(hint.message.toLowerCase()).toMatch(/undo|restart/)
          break
        }
      }
      if (sawUnsolvable) break
    }
    // If every legal square placement remains solvable, the suggestion path still holds.
    if (!sawUnsolvable) {
      const hint = requestHint(engine)
      expect(hint.kind).toBe('suggestion')
    }
  })
})
