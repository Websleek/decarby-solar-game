import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LEVEL_IDS } from '../achievements/registry.ts'
import {
  evaluateCampaignReward,
  MAX_CAMPAIGN_STARS,
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

describe('pickTierForStars boundaries (3-rooftop event)', () => {
  it('maps 9 → A$500, 8 → A$250, 6–7 → A$100, 3–5 → A$50', () => {
    expect(MAX_CAMPAIGN_STARS).toBe(9)
    expect(pickTierForStars(9)?.amountCents).toBe(50_000)
    expect(pickTierForStars(8)?.amountCents).toBe(25_000)
    expect(pickTierForStars(7)?.amountCents).toBe(10_000)
    expect(pickTierForStars(6)?.amountCents).toBe(10_000)
    expect(pickTierForStars(5)?.amountCents).toBe(5_000)
    expect(pickTierForStars(3)?.amountCents).toBe(5_000)
    expect(pickTierForStars(2)).toBeNull()
  })
})

describe('evaluateCampaignReward', () => {
  it('awards correct amounts across 3-level star totals', () => {
    const cases: Array<[number[], number]> = [
      [[1, 1, 1], 5_000], // 3
      [[2, 2, 1], 5_000], // 5
      [[2, 2, 2], 10_000], // 6
      [[3, 2, 2], 10_000], // 7
      [[3, 3, 2], 25_000], // 8
      [[3, 3, 3], 50_000], // 9
    ]
    for (const [stars, cents] of cases) {
      const decision = evaluateCampaignReward(fullRun(stars))
      expect(decision.eligible).toBe(true)
      if (decision.eligible) expect(decision.amountCents).toBe(cents)
    }
  })

  it('rejects incomplete campaigns and zero-star levels', () => {
    expect(evaluateCampaignReward(fullRun([3, 3])).eligible).toBe(false)
    const zero = evaluateCampaignReward(fullRun([3, 3, 0]))
    expect(zero.eligible).toBe(false)
    if (!zero.eligible) expect(zero.code).toBe('zero_star_level')
  })

  it('rejects duplicate levels and does not trust empty record ids', () => {
    const dup = fullRun([3, 3, 3])
    dup.push({ ...dup[0]! })
    expect(evaluateCampaignReward(dup).eligible).toBe(false)

    const missingId = fullRun([3, 3, 3])
    missingId[0] = { ...missingId[0]!, verifiedRecordId: '' }
    expect(evaluateCampaignReward(missingId).eligible).toBe(false)
  })

  it('is idempotent for identical verified inputs', () => {
    const a = evaluateCampaignReward(fullRun([3, 3, 2]))
    const b = evaluateCampaignReward(fullRun([3, 3, 2]))
    expect(a).toEqual(b)
  })
})
