import { describe, expect, it } from 'vitest'
import {
  applyLocalLevelComplete,
  createLocalCampaignRun,
  finalizeCampaignReward,
  toCampaignCompleteView,
} from './runFactory.ts'
import { CAMPAIGN_LEVEL_IDS } from '../achievements/registry.ts'

describe('toCampaignCompleteView claim display', () => {
  it('does not present local-only stars as a claimable verified reward', () => {
    let run = createLocalCampaignRun({
      id: 'local-run',
      nickname: 'Nath',
      serverBacked: false,
    })
    for (const levelId of CAMPAIGN_LEVEL_IDS) {
      run = applyLocalLevelComplete(run, { levelId, stars: 3, score: 9000 })
    }
    run = finalizeCampaignReward(run)

    const view = toCampaignCompleteView(run)
    expect(view.serverVerified).toBe(false)
    expect(view.rewardAmountCents).toBe(0)
    expect(view.rewardLabel).toBeNull()
    expect(view.totalStars).toBe(9)
    expect(view.voucherEligibleMessaging).toMatch(/not server-verified|genuine voucher/i)
  })

  it('keeps server-verified eligible rewards visible for claim', () => {
    let run = createLocalCampaignRun({
      id: 'server-run',
      nickname: 'Nath',
      serverBacked: true,
    })
    for (const levelId of CAMPAIGN_LEVEL_IDS) {
      run = {
        ...run,
        levels: run.levels.map((slot) =>
          slot.levelId === levelId
            ? {
                ...slot,
                status: 'verified' as const,
                stars: 3,
                score: 9000,
                verifiedRecordId: `rec-${levelId}`,
                verifiedAttemptId: `att-${levelId}`,
                levelVersion: 1,
              }
            : slot,
        ),
      }
    }
    run = finalizeCampaignReward(run)
    expect(run.serverBacked).toBe(true)

    // finalize marks provisional=!serverBacked → false when serverBacked
    const settled = { ...run, provisional: false }
    const view = toCampaignCompleteView(settled)
    expect(view.serverVerified).toBe(true)
    expect(view.rewardAmountCents).toBe(50_000)
    expect(view.rewardLabel).toMatch(/500/)
  })
})
