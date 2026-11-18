import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LEVEL_IDS } from '../../shared/achievements/registry'
import { createLocalCampaignRun, applyLocalLevelComplete } from '../../shared/campaign/runFactory'
import {
  isCampaignLevelLocked,
  nextIncompleteCampaignLevelId,
} from './promoRunCache'
import { shouldConfirmResetBeforeFinish } from './playerSessionReset'

describe('event campaign flow guards', () => {
  it('uses exactly three rooftops in sequence', () => {
    expect(CAMPAIGN_LEVEL_IDS).toEqual([
      'sunny-house',
      'chimney-challenge',
      'tricky-rooftop',
    ])
  })

  it('locks completed levels and advances to the next incomplete rooftop', () => {
    let run = createLocalCampaignRun({ id: 'run-1', nickname: 'SolarFox' })
    expect(nextIncompleteCampaignLevelId(run)).toBe('sunny-house')

    run = applyLocalLevelComplete(run, {
      levelId: 'sunny-house',
      stars: 2,
      score: 1200,
    })
    expect(isCampaignLevelLocked(run, 'sunny-house')).toBe(true)
    expect(isCampaignLevelLocked(run, 'chimney-challenge')).toBe(false)
    expect(nextIncompleteCampaignLevelId(run)).toBe('chimney-challenge')

    run = applyLocalLevelComplete(run, {
      levelId: 'chimney-challenge',
      stars: 2,
      score: 1300,
    })
    expect(nextIncompleteCampaignLevelId(run)).toBe('tricky-rooftop')

    run = applyLocalLevelComplete(run, {
      levelId: 'tricky-rooftop',
      stars: 3,
      score: 2000,
    })
    expect(nextIncompleteCampaignLevelId(run)).toBeNull()
    expect(run.levels.every((l) => isCampaignLevelLocked(run, l.levelId))).toBe(true)
  })

  it('asks for confirmation before New Player when claim is unfinished', () => {
    expect(
      shouldConfirmResetBeforeFinish({ promoFlowActive: true, claimCompleted: false }),
    ).toBe(true)
    expect(
      shouldConfirmResetBeforeFinish({ promoFlowActive: true, claimCompleted: true }),
    ).toBe(false)
  })
})

describe('public event navigation copy contracts', () => {
  it('does not advertise More ways to play in nickname or campaign complete modules', async () => {
    const nickname = await import('../components/PromotionalNicknameScreen')
    const campaign = await import('../components/CampaignCompleteScreen')
    expect(JSON.stringify(nickname)).not.toMatch(/More ways to play/i)
    expect(JSON.stringify(campaign)).not.toMatch(/More ways to play/i)
  })

  it('does not expose Replay Level in event level-complete module', async () => {
    const levelComplete = await import('../components/LevelCompleteScreen')
    expect(JSON.stringify(levelComplete)).not.toMatch(/Replay Level/i)
  })
})
