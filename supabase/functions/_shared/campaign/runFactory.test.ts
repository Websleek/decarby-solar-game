import { describe, expect, it } from 'vitest'
import {
  applyLocalLevelComplete,
  createLocalCampaignRun,
  finalizeCampaignReward,
  toCampaignCompleteView,
} from './runFactory.ts'
import { CAMPAIGN_LEVEL_IDS } from '../achievements/registry.ts'

describe('campaign run factory', () => {
  it('creates five pending level slots for a new run', () => {
    const run = createLocalCampaignRun({ id: 'run-1', nickname: 'SolarFox' })
    expect(run.levels).toHaveLength(5)
    expect(run.levels.every((l) => l.status === 'pending')).toBe(true)
    expect(run.provisional).toBe(true)
  })

  it('produces provisional reward estimate after local completion of all levels', () => {
    let run = createLocalCampaignRun({ id: 'run-2', nickname: 'SolarFox' })
    const stars = [3, 3, 3, 2, 2]
    CAMPAIGN_LEVEL_IDS.forEach((levelId, index) => {
      run = applyLocalLevelComplete(run, {
        levelId,
        stars: stars[index]!,
        score: 1000 + index,
      })
    })
    run = finalizeCampaignReward(run)
    expect(run.provisional).toBe(true)
    expect(run.reward?.eligible).toBe(true)
    if (run.reward?.eligible) expect(run.reward.amountCents).toBe(25_000)
    const view = toCampaignCompleteView(run)
    expect(view.serverVerified).toBe(false)
    expect(view.rewardLabel).toBe('A$250 OFF')
  })
})
