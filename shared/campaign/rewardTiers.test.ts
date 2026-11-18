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
  it('maps 0–5 → A$50, 6–7 → A$100, 8 → A$250, 9 → A$500', () => {
    expect(MAX_CAMPAIGN_STARS).toBe(9)
    expect(pickTierForStars(0)?.amountCents).toBe(5_000)
    expect(pickTierForStars(5)?.amountCents).toBe(5_000)
    expect(pickTierForStars(6)?.amountCents).toBe(10_000)
    expect(pickTierForStars(7)?.amountCents).toBe(10_000)
    expect(pickTierForStars(8)?.amountCents).toBe(25_000)
    expect(pickTierForStars(9)?.amountCents).toBe(50_000)
  })
})

describe('evaluateCampaignReward', () => {
  it('gives every completed run at least A$50', () => {
    const cases: Array<[number[], number]> = [
      [[0, 0, 0], 5_000],
      [[1, 1, 1], 5_000],
      [[2, 2, 1], 5_000],
      [[2, 2, 2], 10_000],
      [[3, 2, 2], 10_000],
      [[3, 3, 2], 25_000],
      [[3, 3, 3], 50_000],
    ]
    for (const [stars, cents] of cases) {
      const decision = evaluateCampaignReward(fullRun(stars))
      expect(decision.eligible).toBe(true)
      if (decision.eligible) {
        expect(decision.amountCents).toBe(cents)
        expect(decision.totalStars).toBe(stars.reduce((a, b) => a + b, 0))
      }
    }
  })

  it('rejects incomplete campaigns', () => {
    const incomplete = fullRun([3, 3, 3]).slice(0, 2)
    expect(evaluateCampaignReward(incomplete).eligible).toBe(false)
  })

  it('rejects duplicate levels and empty record ids', () => {
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
