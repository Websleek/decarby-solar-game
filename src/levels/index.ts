import type { LevelDefinition } from '../types/game'
import type { LevelService } from '../types/services'
import { LEVEL_1_SUNNY_HOUSE } from './level1'
import { LEVEL_2_CHIMNEY } from './level2'
import { LEVEL_3_TRICKY } from './level3'
import { LEVEL_4_MASTER } from './level4'
import { LEVEL_5_CHAMPION } from './level5'

const LEVELS: readonly LevelDefinition[] = [
  LEVEL_1_SUNNY_HOUSE,
  LEVEL_2_CHIMNEY,
  LEVEL_3_TRICKY,
  LEVEL_4_MASTER,
  LEVEL_5_CHAMPION,
]

const LEVEL_BY_ID: Record<string, LevelDefinition> = Object.fromEntries(
  LEVELS.map((level) => [level.id, level]),
)

export function getLevelById(levelId: string): LevelDefinition | undefined {
  return LEVEL_BY_ID[levelId]
}

export function listLocalLevels(): LevelDefinition[] {
  return [...LEVELS].sort((a, b) => a.number - b.number)
}

export function getNextLevel(levelId: string): LevelDefinition | undefined {
  const current = getLevelById(levelId)
  if (!current) return undefined
  return LEVELS.find((level) => level.number === current.number + 1)
}

export function getFirstLevel(): LevelDefinition {
  return LEVEL_1_SUNNY_HOUSE
}

/** Local LevelService — swap for an API implementation later. */
export const localLevelService: LevelService = {
  async getLevel(levelId) {
    const level = getLevelById(levelId)
    if (!level) throw new Error(`Unknown level: ${levelId}`)
    return level
  },
  async listLevels() {
    return listLocalLevels()
  },
}

export {
  LEVEL_1_SUNNY_HOUSE,
  LEVEL_2_CHIMNEY,
  LEVEL_3_TRICKY,
  LEVEL_4_MASTER,
  LEVEL_5_CHAMPION,
}
