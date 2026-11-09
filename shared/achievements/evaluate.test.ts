import { describe, expect, it } from 'vitest'
import {
  countInvalidPlaceActions,
  evaluateLocalPreviewAchievements,
  evaluateVerifiedAchievements,
  hasSuccessfulPlaceAction,
} from './evaluate'
import { syncPlayerAchievements } from './award'
import { CAMPAIGN_LEVEL_IDS } from './registry'

const fiveClassic = (stars: number, invalid: number | null = 0) =>
  CAMPAIGN_LEVEL_IDS.map((levelId) => ({
    levelId,
    verifiedStars: stars,
    verifiedInvalidPlacements: invalid,
    hasSuccessfulPlacement: true,
  }))

describe('achievement evaluation', () => {
  it('awards first_spark, solar_starter and perfect_fit from a clean L1 verify', () => {
    const result = evaluateVerifiedAchievements({
      classicRecords: [
        {
          levelId: 'sunny-house',
          verifiedStars: 2,
          verifiedInvalidPlacements: 0,
          hasSuccessfulPlacement: true,
        },
      ],
      timeAttackRecords: [],
      leaderboardStandings: [],
    })
    expect(result.eligible).toEqual(
      expect.arrayContaining(['first_spark', 'solar_starter', 'perfect_fit']),
    )
  })

  it('does not invent perfect_fit when invalid telemetry is unknown', () => {
    const result = evaluateVerifiedAchievements({
      classicRecords: [
        {
          levelId: 'sunny-house',
          verifiedStars: 3,
          verifiedInvalidPlacements: null,
          hasSuccessfulPlacement: true,
        },
      ],
      timeAttackRecords: [],
      leaderboardStandings: [],
    })
    expect(result.eligible).not.toContain('perfect_fit')
  })

  it('requires ten best stars and deduplicates by level', () => {
    const duplicateSunny = [
      {
        levelId: 'sunny-house',
        verifiedStars: 1,
        verifiedInvalidPlacements: 1,
        hasSuccessfulPlacement: true,
      },
      {
        levelId: 'sunny-house',
        verifiedStars: 3,
        verifiedInvalidPlacements: 0,
        hasSuccessfulPlacement: true,
      },
      ...CAMPAIGN_LEVEL_IDS.slice(1).map((levelId) => ({
        levelId,
        verifiedStars: 2,
        verifiedInvalidPlacements: 1,
        hasSuccessfulPlacement: true,
      })),
    ]
    const result = evaluateVerifiedAchievements({
      classicRecords: duplicateSunny,
      timeAttackRecords: [],
      leaderboardStandings: [],
    })
    // 3 + 2*4 = 11
    expect(result.eligible).toContain('star_collector')
    expect(result.eligible).toContain('solar_champion')
  })

  it('awards three_star_master and speed_builder independently', () => {
    const result = evaluateVerifiedAchievements({
      classicRecords: fiveClassic(3, 0),
      timeAttackRecords: [{ levelId: 'sunny-house' }],
      leaderboardStandings: [],
    })
    expect(result.eligible).toEqual(
      expect.arrayContaining([
        'speed_builder',
        'three_star_master',
        'solar_champion',
        'star_collector',
      ]),
    )
  })

  it('awards solar_legend only for top-ten standings', () => {
    const miss = evaluateVerifiedAchievements({
      classicRecords: [],
      timeAttackRecords: [],
      leaderboardStandings: [{ board: 'overall', rank: 11 }],
    })
    expect(miss.eligible).not.toContain('solar_legend')

    const hit = evaluateVerifiedAchievements({
      classicRecords: [],
      timeAttackRecords: [],
      leaderboardStandings: [{ board: 'speed', rank: 4 }],
    })
    expect(hit.eligible).toContain('solar_legend')
  })

  it('counts invalid_place telemetry helpers', () => {
    const actions = [
      { kind: 'place' },
      { kind: 'invalid_place' },
      { kind: 'invalid_place' },
      { kind: 'complete' },
    ]
    expect(countInvalidPlaceActions(actions)).toBe(2)
    expect(hasSuccessfulPlaceAction(actions)).toBe(true)
  })

  it('supports local guest preview without solar_legend', () => {
    const preview = evaluateLocalPreviewAchievements({
      completedLevels: [...CAMPAIGN_LEVEL_IDS],
      bestStars: Object.fromEntries(CAMPAIGN_LEVEL_IDS.map((id) => [id, 3])),
      timeAttackBestMs: { 'sunny-house': 12_000 },
      perfectRoofLevels: ['sunny-house'],
      hasLocalPlacement: true,
    })
    expect(preview).toContain('solar_champion')
    expect(preview).toContain('three_star_master')
    expect(preview).not.toContain('solar_legend')
  })

  it('idempotently syncs awards and reports only newly inserted rows', async () => {
    const seen = new Set<string>()
    const awards = await syncPlayerAchievements({
      snapshot: {
        classicRecords: fiveClassic(3, 0),
        timeAttackRecords: [{ levelId: 'sunny-house' }],
        leaderboardStandings: [{ board: 'overall', rank: 1 }],
      },
      award: async ({ achievementId }) => {
        const inserted = !seen.has(achievementId)
        seen.add(achievementId)
        return { inserted, earnedAt: '2026-11-10T00:00:00.000Z' }
      },
    })

    expect(awards.every((row) => row.inserted)).toBe(true)
    expect(awards.map((row) => row.achievementId)).toEqual(
      expect.arrayContaining(['solar_legend', 'three_star_master', 'first_spark']),
    )

    const second = await syncPlayerAchievements({
      snapshot: {
        classicRecords: fiveClassic(3, 0),
        timeAttackRecords: [{ levelId: 'sunny-house' }],
        leaderboardStandings: [{ board: 'overall', rank: 1 }],
      },
      award: async ({ achievementId }) => {
        const inserted = !seen.has(achievementId)
        seen.add(achievementId)
        return { inserted, earnedAt: '2026-11-10T00:00:00.000Z' }
      },
    })
    expect(second.every((row) => row.inserted === false)).toBe(true)
  })

  it('unlocks multiple achievements from one completion snapshot', () => {
    const result = evaluateVerifiedAchievements({
      classicRecords: [
        {
          levelId: 'sunny-house',
          verifiedStars: 3,
          verifiedInvalidPlacements: 0,
          hasSuccessfulPlacement: true,
        },
      ],
      timeAttackRecords: [],
      leaderboardStandings: [],
    })
    expect(result.eligible.length).toBeGreaterThanOrEqual(3)
  })
})
