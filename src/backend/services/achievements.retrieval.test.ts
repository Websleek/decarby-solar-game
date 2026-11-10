import { describe, expect, it } from 'vitest'
import { catalogUnlocksFromPersisted } from '../../../shared/achievements/award'
import { ACHIEVEMENT_BY_ID, listAchievements } from '../../../shared/achievements/registry'
import { achievementService, type EarnedAchievement } from './achievements'

describe('achievement persistence vs eligibility display', () => {
  it('maps only persisted earned rows into unlocked catalog entries', () => {
    const earned: EarnedAchievement[] = [
      {
        achievementId: 'first_spark',
        earnedAt: '2026-11-10T00:00:00.000Z',
        sourceAttemptId: null,
        sourceRecordId: null,
      },
      {
        achievementId: 'solar_starter',
        earnedAt: '2026-11-10T00:01:00.000Z',
        sourceAttemptId: null,
        sourceRecordId: null,
      },
    ]

    const catalog = achievementService.mergeCatalog(earned, {
      completedLevels: ['sunny-house'],
      bestStars: { 'sunny-house': 1 },
      timeAttackBestMs: {},
      perfectRoofLevels: [],
    })

    const first = catalog.find((row) => row.id === 'first_spark')
    const starter = catalog.find((row) => row.id === 'solar_starter')
    const legend = catalog.find((row) => row.id === 'solar_legend')

    expect(first?.unlocked).toBe(true)
    expect(first?.earnedAt).toBe('2026-11-10T00:00:00.000Z')
    expect(first?.localPreviewOnly).toBe(false)

    expect(starter?.unlocked).toBe(true)
    expect(starter?.earnedAt).toBe('2026-11-10T00:01:00.000Z')

    expect(legend?.unlocked).toBe(false)
    expect(legend?.earnedAt).toBeNull()
  })

  it('keeps badges locked when evaluate returns awards metadata but empty earned', () => {
    const unlocks = catalogUnlocksFromPersisted([], listAchievements().map((row) => row.id))
    expect(unlocks.size).toBe(0)

    const catalog = achievementService.mergeCatalog([], {
      completedLevels: ['sunny-house'],
      bestStars: { 'sunny-house': 1 },
      timeAttackBestMs: {},
      perfectRoofLevels: [],
    })
    expect(catalog.filter((row) => row.unlocked)).toEqual([])
    expect(catalog.find((row) => row.id === 'solar_starter')?.localPreviewOnly).toBe(true)
  })

  it('accepts duplicate/backfilled persisted rows without inventing extra unlocks', () => {
    const earned: EarnedAchievement[] = [
      {
        achievementId: 'first_spark',
        earnedAt: '2026-11-10T00:00:00.000Z',
        sourceAttemptId: null,
        sourceRecordId: null,
      },
      {
        achievementId: 'first_spark',
        earnedAt: '2026-11-10T00:00:00.000Z',
        sourceAttemptId: null,
        sourceRecordId: null,
      },
    ]
    const catalog = achievementService.mergeCatalog(earned, {
      completedLevels: [],
      bestStars: {},
      timeAttackBestMs: {},
      perfectRoofLevels: [],
    })
    expect(catalog.filter((row) => row.unlocked).map((row) => row.id)).toEqual(['first_spark'])
    expect('first_spark' in ACHIEVEMENT_BY_ID).toBe(true)
  })
})
