import { describe, expect, it } from 'vitest'
import { LEVEL_3_TRICKY } from '../levels/level3'
import { LEVEL_4_MASTER } from '../levels/level4'
import { analyzeLevelDifficulty } from './difficultyAnalysis'

describe('level 4 rebalance analysis', () => {
  it('is harder than level 3 by piece mix and required rotations', () => {
    const l3 = analyzeLevelDifficulty(LEVEL_3_TRICKY)
    const l4 = analyzeLevelDifficulty(LEVEL_4_MASTER)

    expect(l3.solvable).toBe(true)
    expect(l4.solvable).toBe(true)
    expect(l4.requiredRotations).toBeGreaterThan(0)
    expect(l4.nonSquarePieces).toBeGreaterThan(l3.nonSquarePieces)
    expect(l4.distinctPieceTypes).toBeGreaterThanOrEqual(4)
  }, 60_000)
})
