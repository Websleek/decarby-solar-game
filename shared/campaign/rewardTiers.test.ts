import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LEVEL_IDS } from '../achievements/registry.ts'
import {
  evaluateCampaignReward,
  pickTierForStars,
  type VerifiedCampaignLevelResult,
} from './rewardTiers.ts'

function fullRun(stars: readonly number[]): VerifiedCampaignLevelResult[] {
  return CAMPAIGN_LEVEL_IDS.map((levelId, index) => ({
    levelId,
    verifiedStars: stars[index] ?? 0,
    verifiedScore: 1000 + index,
    verifiedRecordId: `rec-${levelId}`,
    levelVersion: 1,
  }))
}

describe('pickTierForStars boundaries', () => {
  it('maps 15 → A$500, 13–14 → A$250, 10–12 → A$100, 5–9 → A$50', () => {
    expect(pickTierForStars(15)?.amountCents).toBe(50_000)
    expect(pickTierForStars(14)?.amountCents).toBe(25_000)
    expect(pickTierForStars(13)?.amountCents).toBe(25_000)
    expect(pickTierForStars(12)?.amountCents).toBe(10_000)
    expect(pickTierForStars(10)?.amountCents).toBe(10_000)
    expect(pickTierForStars(9)?.amountCents).toBe(5_000)
    expect(pickTierForStars(5)?.amountCents).toBe(5_000)
    expect(pickTierForStars(4)).toBeNull()
  })
})

describe('evaluateCampaignReward', () => {
  it('awards correct amounts at 9, 10, 12, 13, 14 and 15 stars', () => {
    const cases: Array<[number[], number]> = [
      [[1, 2, 2, 2, 2], 5_000], // 9
      [[2, 2, 2, 2, 2], 10_000], // 10
      [[3, 3, 2, 2, 2], 10_000], // 12
      [[3, 3, 3, 2, 2], 25_000], // 13
      [[3, 3, 3, 3, 2], 25_000], // 14
      [[3, 3, 3, 3, 3], 50_000], // 15
    ]
    for (const [stars, cents] of cases) {
      const decision = evaluateCampaignReward(fullRun(stars))
      expect(decision.eligible).toBe(true)
      if (decision.eligible) expect(decision.amountCents).toBe(cents)
    }
  })

  it('rejects incomplete campaigns and zero-star levels', () => {
    expect(evaluateCampaignReward(fullRun([3, 3, 3, 3])).eligible).toBe(false)
    const zero = evaluateCampaignReward(fullRun([3, 3, 3, 3, 0]))
    expect(zero.eligible).toBe(false)
    if (!zero.eligible) expect(zero.code).toBe('zero_star_level')
  })

  it('rejects duplicate levels and does not trust empty record ids', () => {
    const dup = fullRun([3, 3, 3, 3, 3])
    dup.push({ ...dup[0]! })
    expect(evaluateCampaignReward(dup).eligible).toBe(false)

    const missingId = fullRun([3, 3, 3, 3, 3])
    missingId[0] = { ...missingId[0]!, verifiedRecordId: '' }
    expect(evaluateCampaignReward(missingId).eligible).toBe(false)
  })

  it('is idempotent for identical verified inputs', () => {
    const a = evaluateCampaignReward(fullRun([3, 3, 3, 2, 2]))
    const b = evaluateCampaignReward(fullRun([3, 3, 3, 2, 2]))
    expect(a).toEqual(b)
  })
})
