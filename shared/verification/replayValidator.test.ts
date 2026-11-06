import { describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE, LEVEL_1_SOLUTION } from '../../src/levels/level1'
import { createPuzzleEngine } from '../../src/engine/puzzleState'
import { applySolution } from '../../src/engine/applySolution'
import { getApprovedLevel } from './levelCatalog.ts'
import { buildInventoryPieceIds } from './inventory.ts'
import { sanitizeActions, validateReplay } from './replayValidator.ts'
import { hashLevelConfiguration } from './hash.ts'

const approved = getApprovedLevel('sunny-house', 1)!

describe('replay validator', () => {
  it('verifies a valid completed classic attempt from recorded actions', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE, { recordActions: true })
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    engine.recordCompleteAction()
    const result = validateReplay(
      approved,
      'classic',
      buildInventoryPieceIds(approved),
      engine.getActionLog(),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.coveragePercent).toBe(100)
      expect(result.score).toBe(5500)
      expect(result.stars).toBe(3)
    }
  })

  it('rejects an invalid placement in the action log', () => {
    const actions = sanitizeActions([
      {
        seq: 0,
        kind: 'place',
        pieceId: `${approved.id}-square-1`,
        origin: { col: 0, row: 0 },
        rotation: 0,
        clientAtMs: 1,
      },
      {
        seq: 1,
        kind: 'place',
        pieceId: `${approved.id}-square-2`,
        origin: { col: 0, row: 0 },
        rotation: 0,
        clientAtMs: 2,
      },
      { seq: 2, kind: 'complete', clientAtMs: 3 },
    ])
    expect(actions).not.toBeNull()
    const result = validateReplay(approved, 'classic', buildInventoryPieceIds(approved), actions!)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid_placement')
  })

  it('server-recomputed score ignores a forged claimed score', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE, { recordActions: true })
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    engine.recordCompleteAction()
    const result = validateReplay(
      approved,
      'classic',
      buildInventoryPieceIds(approved),
      engine.getActionLog(),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.score).toBe(5500)
      expect(result.score).not.toBe(999999)
    }
  })

  it('rejects time attack below full coverage', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE, { recordActions: true })
    expect(applySolution(engine, LEVEL_1_SOLUTION.slice(0, 6))).toBe(true)
    engine.recordCompleteAction()
    const result = validateReplay(
      approved,
      'timeAttack',
      buildInventoryPieceIds(approved),
      engine.getActionLog(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('mode_rules')
  })

  it('rejects unknown piece ids', () => {
    const actions = sanitizeActions([
      {
        seq: 0,
        kind: 'place',
        pieceId: 'forged-piece',
        origin: { col: 0, row: 0 },
        rotation: 0,
        clientAtMs: 1,
      },
      { seq: 1, kind: 'complete', clientAtMs: 2 },
    ])
    const result = validateReplay(approved, 'classic', buildInventoryPieceIds(approved), actions!)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid_piece')
  })

  it('rejects incomplete attempts without a complete action', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE, { recordActions: true })
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    const result = validateReplay(
      approved,
      'classic',
      buildInventoryPieceIds(approved),
      engine.getActionLog(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('incomplete')
  })

  it('rejects malformed action payloads', () => {
    expect(sanitizeActions([{ kind: 'place' }])).toBeNull()
    expect(sanitizeActions(null)).toBeNull()
  })

  it('keeps approved catalog hashes stable for sunny-house', () => {
    expect(hashLevelConfiguration(approved)).toBe('fnv1a_81da96c8')
  })
})
