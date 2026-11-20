import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LEVEL_IDS } from '../achievements/registry.ts'
import {
  applyLocalLevelComplete,
  createLocalCampaignRun,
  finalizeCampaignReward,
  toCampaignCompleteView,
} from './runFactory.ts'

describe('toCampaignCompleteView reward consistency', () => {
  it('keeps rooftop stars, total stars, and reward aligned for a completed run', () => {
    let run = createLocalCampaignRun({ id: 'run-view', nickname: 'SolarFox', serverBacked: true })
    const stars = [2, 2, 1]
    CAMPAIGN_LEVEL_IDS.forEach((levelId, index) => {
      run = applyLocalLevelComplete(run, {
        levelId,
        stars: stars[index]!,
        score: 1000 + index,
      })
    })
    run = finalizeCampaignReward(run)
    const view = toCampaignCompleteView(run)

    expect(view.totalStars).toBe(5)
    expect(view.run.levels.map((l) => l.stars)).toEqual([2, 2, 1])
    expect(view.totalStars).toBe(
      view.run.levels.reduce((sum, level) => sum + (level.stars ?? 0), 0),
    )
    // Local-complete (unverified) slots never unlock a claimable reward label.
    expect(view.rewardLabel).toBeNull()
    expect(view.rewardAmountCents).toBe(0)
    expect(view.serverVerified).toBe(false)
    expect(view.nextStepLabel).toBe('Continue')
    expect(JSON.stringify(view)).not.toMatch(/Not eligible|Keep practising|No promotional tier/i)
  })

  it('never shows Not eligible for a completed valid event run', () => {
    let run = createLocalCampaignRun({ id: 'run-ok', nickname: 'Ace', serverBacked: true })
    for (const levelId of CAMPAIGN_LEVEL_IDS) {
      run = applyLocalLevelComplete(run, { levelId, stars: 3, score: 2000 })
    }
    run = finalizeCampaignReward({
      ...run,
      levels: run.levels.map((slot) => ({
        ...slot,
        status: 'verified' as const,
        verifiedRecordId: `rec-${slot.levelId}`,
        verifiedAttemptId: `att-${slot.levelId}`,
        levelVersion: 1,
      })),
      serverBacked: true,
      provisional: false,
    })
    const view = toCampaignCompleteView(run)
    expect(view.rewardAmountCents).toBe(50_000)
    expect(view.rewardLabel).toBe('A$500 OFF')
    expect(view.totalStars).toBe(9)
    expect(`${view.rewardLabel} ${view.voucherEligibleMessaging}`).not.toMatch(/Not eligible/i)
  })
})
