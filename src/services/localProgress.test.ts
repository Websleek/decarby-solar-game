import { beforeEach, describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE } from '../levels/level1'
import { LEVEL_2_CHIMNEY } from '../levels/level2'
import { LEVEL_4_MASTER } from '../levels/level4'
import { classicResult, timeAttackResult } from '../test/levelResultFixtures'
import {
  deriveUnlockedLevels,
  getLevelScoreDisplay,
  isTimeAttackLevelAvailable,
  localProgressService,
  reconcileScoreVersions,
} from './localProgress'
import type { PlayerProgress } from '../types/services'

const STORAGE_KEY = 'decarby-solar-progress'

function emptyExtras(): Pick<
  PlayerProgress,
  'timeAttackBestMs' | 'perfectRoofLevels' | 'preferredGameMode'
> {
  return {
    timeAttackBestMs: {},
    perfectRoofLevels: [],
    preferredGameMode: null,
  }
}

describe('local progress persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('unlocks level 1 by default', async () => {
    const progress = await localProgressService.load()
    expect(progress.unlockedLevels).toContain(LEVEL_1_SUNNY_HOUSE.id)
    expect(progress.unlockedLevels).not.toContain(LEVEL_2_CHIMNEY.id)
    expect(progress.timeAttackBestMs).toEqual({})
    expect(progress.perfectRoofLevels).toEqual([])
  })

  it('migrates phase 1 saves without wiping level 1 progress', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        data: {
          completedLevels: [LEVEL_1_SUNNY_HOUSE.id],
          bestScores: { [LEVEL_1_SUNNY_HOUSE.id]: 5500 },
          bestStars: { [LEVEL_1_SUNNY_HOUSE.id]: 3 },
          soundEnabled: false,
          tutorialCompleted: true,
          achievements: ['solar-starter'],
        },
      }),
    )

    const progress = await localProgressService.load()
    expect(progress.bestScores[LEVEL_1_SUNNY_HOUSE.id]).toBe(5500)
    expect(progress.bestStars[LEVEL_1_SUNNY_HOUSE.id]).toBe(3)
    expect(progress.soundEnabled).toBe(false)
    expect(progress.tutorialCompleted).toBe(true)
    expect(progress.unlockedLevels).toContain(LEVEL_1_SUNNY_HOUSE.id)
    expect(progress.unlockedLevels).toContain(LEVEL_2_CHIMNEY.id)
    expect(progress.achievements).toContain('solar-starter')
    expect(progress.timeAttackBestMs).toEqual({})
    expect(progress.perfectRoofLevels).toEqual([])
  })

  it('unlocks the next level only after earning at least one star', async () => {
    await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        score: 2900,
        stars: 1,
        coveragePercent: 60,
        occupiedCells: 24,
        isPerfect: false,
        achievements: ['solar-starter'],
      }),
    )
    const progress = await localProgressService.load()
    expect(progress.unlockedLevels).toContain(LEVEL_2_CHIMNEY.id)
    expect(progress.bestDurations[LEVEL_1_SUNNY_HOUSE.id]).toBe(30_000)
  })

  it('does not apply Time Attack results to Classic score records', async () => {
    await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        score: 5500,
        stars: 3,
        achievements: ['solar-starter'],
      }),
    )
    await localProgressService.recordTimeAttackResult(
      timeAttackResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        durationMs: 12_500,
      }),
    )

    const progress = await localProgressService.load()
    expect(progress.bestScores[LEVEL_1_SUNNY_HOUSE.id]).toBe(5500)
    expect(progress.timeAttackBestMs[LEVEL_1_SUNNY_HOUSE.id]).toBe(12_500)
  })

  it('unlocks Time Attack only for Classic completions', async () => {
    let progress = await localProgressService.load()
    expect(isTimeAttackLevelAvailable(progress, LEVEL_1_SUNNY_HOUSE.id)).toBe(false)

    progress = await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        score: 5500,
        stars: 3,
        achievements: ['solar-starter'],
      }),
    )
    expect(isTimeAttackLevelAvailable(progress, LEVEL_1_SUNNY_HOUSE.id)).toBe(true)
    expect(isTimeAttackLevelAvailable(progress, LEVEL_2_CHIMNEY.id)).toBe(false)
  })

  it('records only qualifying 100% Time Attack times and keeps the best', async () => {
    await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        score: 5500,
        stars: 3,
        achievements: ['solar-starter'],
      }),
    )

    await localProgressService.recordTimeAttackResult(
      timeAttackResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        durationMs: 20_000,
        coveragePercent: 90,
      }),
    )
    let progress = await localProgressService.load()
    expect(progress.timeAttackBestMs[LEVEL_1_SUNNY_HOUSE.id]).toBeUndefined()

    await localProgressService.recordTimeAttackResult(
      timeAttackResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        durationMs: 18_000,
      }),
    )
    await localProgressService.recordTimeAttackResult(
      timeAttackResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        durationMs: 22_000,
        isNewPersonalBest: false,
        previousBestMs: 18_000,
      }),
    )
    progress = await localProgressService.load()
    expect(progress.timeAttackBestMs[LEVEL_1_SUNNY_HOUSE.id]).toBe(18_000)
  })

  it('stores Perfect Roof completions from Classic results', async () => {
    await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        score: 5500,
        stars: 3,
        perfectRoof: true,
        achievements: ['solar-starter', 'perfect-roof'],
      }),
    )
    const progress = await localProgressService.load()
    expect(progress.perfectRoofLevels).toContain(LEVEL_1_SUNNY_HOUSE.id)
    expect(progress.achievements).toContain('perfect-roof')
  })

  it('ignores Classic progression writes from Time Attack mode results', async () => {
    await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        score: 9999,
        stars: 3,
        mode: 'timeAttack',
        achievements: ['solar-starter'],
      }),
    )
    const progress = await localProgressService.load()
    expect(progress.completedLevels).not.toContain(LEVEL_1_SUNNY_HOUSE.id)
    expect(progress.bestScores[LEVEL_1_SUNNY_HOUSE.id]).toBeUndefined()
  })

  it('deriveUnlockedLevels keeps level 1 available', () => {
    expect(deriveUnlockedLevels([], {}, [])).toEqual([LEVEL_1_SUNNY_HOUSE.id])
  })

  it('archives outdated Level 4 scores as legacy without clearing unlocks', () => {
    const prior: PlayerProgress = {
      completedLevels: [LEVEL_4_MASTER.id],
      unlockedLevels: [LEVEL_1_SUNNY_HOUSE.id, LEVEL_4_MASTER.id],
      bestScores: { [LEVEL_4_MASTER.id]: 7800 },
      scorePuzzleVersions: {},
      legacyBestScores: {},
      bestStars: { [LEVEL_4_MASTER.id]: 3 },
      bestDurations: { [LEVEL_4_MASTER.id]: 40_000 },
      selectedLevelId: LEVEL_4_MASTER.id,
      soundEnabled: true,
      tutorialCompleted: true,
      achievements: ['solar-puzzle-master'],
      ...emptyExtras(),
    }

    const reconciled = reconcileScoreVersions(prior)
    expect(reconciled.bestStars[LEVEL_4_MASTER.id]).toBe(3)
    expect(reconciled.completedLevels).toContain(LEVEL_4_MASTER.id)
    expect(reconciled.bestScores[LEVEL_4_MASTER.id]).toBeUndefined()
    expect(reconciled.legacyBestScores[LEVEL_4_MASTER.id]).toBe(7800)

    const display = getLevelScoreDisplay(reconciled, LEVEL_4_MASTER)
    expect(display.currentBest).toBeNull()
    expect(display.legacyBest).toBe(7800)
    expect(display.isCurrentVersion).toBe(false)
  })

  it('records a new Level 4 personal best against puzzle version 2 only', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        data: {
          completedLevels: [LEVEL_4_MASTER.id],
          unlockedLevels: [LEVEL_4_MASTER.id],
          bestScores: { [LEVEL_4_MASTER.id]: 7800 },
          bestStars: { [LEVEL_4_MASTER.id]: 2 },
          bestDurations: {},
          soundEnabled: true,
          tutorialCompleted: true,
          achievements: ['solar-puzzle-master'],
        },
      }),
    )

    await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_4_MASTER.id,
        score: 7200,
        stars: 3,
        occupiedCells: 40,
        playableCells: 40,
        durationMs: 55_000,
        achievements: ['solar-puzzle-master'],
      }),
    )

    const progress = await localProgressService.load()
    expect(progress.legacyBestScores[LEVEL_4_MASTER.id]).toBe(7800)
    expect(progress.bestScores[LEVEL_4_MASTER.id]).toBe(7200)
    expect(progress.scorePuzzleVersions[LEVEL_4_MASTER.id]).toBe(2)
    expect(progress.bestStars[LEVEL_4_MASTER.id]).toBe(3)
  })

  it('migrates schema v3 saves into v4 fields safely', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        data: {
          completedLevels: [LEVEL_1_SUNNY_HOUSE.id],
          unlockedLevels: [LEVEL_1_SUNNY_HOUSE.id, LEVEL_2_CHIMNEY.id],
          bestScores: { [LEVEL_1_SUNNY_HOUSE.id]: 5500 },
          scorePuzzleVersions: { [LEVEL_1_SUNNY_HOUSE.id]: 1 },
          legacyBestScores: {},
          bestStars: { [LEVEL_1_SUNNY_HOUSE.id]: 3 },
          bestDurations: { [LEVEL_1_SUNNY_HOUSE.id]: 25_000 },
          selectedLevelId: LEVEL_1_SUNNY_HOUSE.id,
          soundEnabled: true,
          tutorialCompleted: true,
          achievements: ['solar-starter'],
        },
      }),
    )

    const progress = await localProgressService.load()
    expect(progress.completedLevels).toContain(LEVEL_1_SUNNY_HOUSE.id)
    expect(progress.bestScores[LEVEL_1_SUNNY_HOUSE.id]).toBe(5500)
    expect(progress.timeAttackBestMs).toEqual({})
    expect(progress.perfectRoofLevels).toEqual([])
    expect(progress.preferredGameMode).toBeNull()
  })
})
