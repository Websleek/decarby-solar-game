import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LEVEL_IDS } from '../../shared/achievements/registry'
import { createLocalCampaignRun, applyLocalLevelComplete } from '../../shared/campaign/runFactory'
import {
  isCampaignLevelLocked,
  nextIncompleteCampaignLevelId,
  resolveAttemptCampaignRunId,
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

  it('keeps explicit campaignRunId for the first rooftop while promo React state is still stale', () => {
    expect(
      resolveAttemptCampaignRunId({
        explicitCampaignRunId: '4ea53087-24b5-4dfc-a9a2-877db8e5af3c',
        promoFlowActive: false,
        serverBackedRunId: null,
      }),
    ).toBe('4ea53087-24b5-4dfc-a9a2-877db8e5af3c')

    expect(
      resolveAttemptCampaignRunId({
        explicitCampaignRunId: null,
        promoFlowActive: false,
        serverBackedRunId: null,
      }),
    ).toBeNull()

    expect(
      resolveAttemptCampaignRunId({
        promoFlowActive: true,
        serverBackedRunId: 'server-run',
      }),
    ).toBe('server-run')

    expect(
      resolveAttemptCampaignRunId({
        promoFlowActive: false,
        serverBackedRunId: 'server-run',
      }),
    ).toBeNull()
  })
})

describe('public event does not probe staff operator access on boot', () => {
  it('App source no longer mounts operatorClaimsService.checkAccess for every visitor', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
    expect(appSource).not.toContain('operatorClaimsService.checkAccess')
    expect(appSource).toContain("=== 'operator-claims'")
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
