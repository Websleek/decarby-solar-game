import { describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE } from '../levels/level1'
import { LEVEL_4_MASTER } from '../levels/level4'
import { hashLevelConfiguration } from './levelHash'

describe('level configuration hash', () => {
  it('is stable for the same level definition', () => {
    expect(hashLevelConfiguration(LEVEL_1_SUNNY_HOUSE)).toBe(
      hashLevelConfiguration(LEVEL_1_SUNNY_HOUSE),
    )
  })

  it('differs across distinct puzzle layouts', () => {
    expect(hashLevelConfiguration(LEVEL_1_SUNNY_HOUSE)).not.toBe(
      hashLevelConfiguration(LEVEL_4_MASTER),
    )
  })
})
