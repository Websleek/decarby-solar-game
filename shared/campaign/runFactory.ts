import { CAMPAIGN_LEVEL_IDS, type CampaignLevelId } from '../achievements/registry.ts'
import {
  evaluateCampaignReward,
  PROMOTIONAL_CAMPAIGN_ID,
  PROMOTIONAL_CAMPAIGN_VERSION,
  type VerifiedCampaignLevelResult,
} from './rewardTiers.ts'
import type {
  CampaignCompleteView,
  CampaignLevelSlot,
  PromotionalCampaignRun,
} from './types.ts'

const LEVEL_TITLES: Record<CampaignLevelId, { title: string; number: number }> = {
  'sunny-house': { title: 'Sunny House', number: 1 },
  'chimney-challenge': { title: 'Chimney Challenge', number: 2 },
  'tricky-rooftop': { title: 'Tricky Rooftop', number: 3 },
}

export function createEmptyCampaignSlots(): CampaignLevelSlot[] {
  return CAMPAIGN_LEVEL_IDS.map((levelId) => ({
    levelId,
    levelTitle: LEVEL_TITLES[levelId].title,
    levelNumber: LEVEL_TITLES[levelId].number,
    status: 'pending',
    stars: null,
    score: null,
    verifiedRecordId: null,
    verifiedAttemptId: null,
    levelVersion: null,
  }))
}

export function createLocalCampaignRun(input: {
  id: string
  nickname: string | null
  playerId?: string | null
  serverBacked?: boolean
  nowIso?: string
}): PromotionalCampaignRun {
  return {
    id: input.id,
    campaignId: PROMOTIONAL_CAMPAIGN_ID,
    campaignVersion: PROMOTIONAL_CAMPAIGN_VERSION,
    playerId: input.playerId ?? null,
    nickname: input.nickname,
    status: 'in_progress',
    serverBacked: input.serverBacked === true,
    levels: createEmptyCampaignSlots(),
    reward: null,
    rewardTierId: null,
    createdAt: input.nowIso ?? new Date().toISOString(),
    completedAt: null,
    provisional: true,
  }
}

export function applyLocalLevelComplete(
  run: PromotionalCampaignRun,
  input: { levelId: CampaignLevelId; stars: number; score: number },
): PromotionalCampaignRun {
  const levels = run.levels.map((slot) =>
    slot.levelId === input.levelId
      ? {
          ...slot,
          status: 'local_complete' as const,
          stars: input.stars,
          score: input.score,
        }
      : slot,
  )
  const allLocal = levels.every((s) => s.status === 'local_complete' || s.status === 'verified')
  return {
    ...run,
    levels,
    status: allLocal ? 'awaiting_verification' : run.status,
    provisional: true,
  }
}

export function applyVerifiedLevelResult(
  run: PromotionalCampaignRun,
  input: {
    levelId: CampaignLevelId
    stars: number
    score: number
    verifiedRecordId: string
    verifiedAttemptId: string | null
    levelVersion: number
  },
): PromotionalCampaignRun {
  const levels = run.levels.map((slot) =>
    slot.levelId === input.levelId
      ? {
          ...slot,
          status: 'verified' as const,
          stars: input.stars,
          score: input.score,
          verifiedRecordId: input.verifiedRecordId,
          verifiedAttemptId: input.verifiedAttemptId,
          levelVersion: input.levelVersion,
        }
      : slot,
  )
  return { ...run, levels, provisional: !levels.every((s) => s.status === 'verified') }
}

export function finalizeCampaignReward(run: PromotionalCampaignRun): PromotionalCampaignRun {
  const verified = run.levels.filter((s) => s.status === 'verified')
  const facts: VerifiedCampaignLevelResult[] = verified
    .filter((s) => s.verifiedRecordId && s.stars != null && s.score != null)
    .map((s) => ({
      levelId: s.levelId,
      verifiedStars: s.stars!,
      verifiedScore: s.score!,
      verifiedRecordId: s.verifiedRecordId!,
      levelVersion: s.levelVersion ?? 1,
    }))

  const allLocalDone = run.levels.every(
    (s) => s.status === 'local_complete' || s.status === 'verified',
  )

  // Authoritative path: verified run association only.
  if (verified.length === CAMPAIGN_LEVEL_IDS.length) {
    const reward = evaluateCampaignReward(facts)
    return {
      ...run,
      reward,
      rewardTierId: reward.eligible ? reward.tierId : null,
      status: reward.eligible ? 'reward_calculated' : 'ineligible',
      completedAt: new Date().toISOString(),
      provisional: !run.serverBacked,
    }
  }

  // Provisional estimate from this run's local completions only (never voucher-eligible).
  if (allLocalDone) {
    const provisionalFacts: VerifiedCampaignLevelResult[] = run.levels.map((s) => ({
      levelId: s.levelId,
      verifiedStars: s.stars ?? 0,
      verifiedScore: s.score ?? 0,
      verifiedRecordId: s.verifiedRecordId ?? `local-${s.levelId}`,
      levelVersion: s.levelVersion ?? 1,
    }))
    const reward = evaluateCampaignReward(provisionalFacts)
    return {
      ...run,
      reward,
      rewardTierId: reward.eligible ? reward.tierId : null,
      status: 'awaiting_verification',
      completedAt: new Date().toISOString(),
      provisional: true,
    }
  }

  const reward = evaluateCampaignReward(facts)
  return {
    ...run,
    reward,
    rewardTierId: null,
    status: 'ineligible',
    completedAt: new Date().toISOString(),
    provisional: true,
  }
}

export function toCampaignCompleteView(run: PromotionalCampaignRun): CampaignCompleteView {
  const levelStars = run.levels.reduce((sum, s) => sum + (s.stars ?? 0), 0)
  const levelScore = run.levels.reduce((sum, s) => sum + (s.score ?? 0), 0)
  const allLevelsPresent = run.levels.length === CAMPAIGN_LEVEL_IDS.length
  const allLevelsDone = run.levels.every(
    (s) => s.status === 'local_complete' || s.status === 'verified',
  )
  const allLevelsServerVerified =
    run.serverBacked && run.levels.every((s) => s.status === 'verified')

  // Authoritative display only from server-verified slots / decisions.
  // Never promote local-only stars into a claimable reward label.
  let displayReward = run.reward
  if (
    run.serverBacked &&
    allLevelsServerVerified &&
    (!displayReward || !displayReward.eligible) &&
    allLevelsPresent
  ) {
    displayReward = evaluateCampaignReward(
      run.levels.map((s) => ({
        levelId: s.levelId,
        verifiedStars: s.stars ?? 0,
        verifiedScore: s.score ?? 0,
        verifiedRecordId: s.verifiedRecordId ?? `missing-${s.levelId}`,
        levelVersion: s.levelVersion ?? 1,
      })),
    )
  }

  const totalStars = allLevelsServerVerified
    ? displayReward && Number.isInteger(displayReward.totalStars)
      ? displayReward.totalStars
      : levelStars
    : levelStars
  const totalScore = allLevelsServerVerified
    ? displayReward && Number.isInteger(displayReward.totalScore)
      ? displayReward.totalScore
      : levelScore
    : levelScore

  const serverVerified =
    run.serverBacked &&
    allLevelsServerVerified &&
    run.reward != null &&
    run.reward.eligible === true &&
    !run.provisional

  let voucherEligibleMessaging: string
  if (!allLevelsDone) {
    voucherEligibleMessaging = 'Finish all three rooftops to unlock your reward.'
  } else if (!run.serverBacked) {
    voucherEligibleMessaging =
      'This play was not server-verified, so it cannot earn a genuine voucher. Start a new verified challenge when your connection is ready.'
  } else if (run.provisional || !serverVerified) {
    voucherEligibleMessaging =
      'Online verification is still required before you can claim. Tap retry if your connection dropped.'
  } else if (displayReward?.eligible) {
    voucherEligibleMessaging =
      'Thanks for playing the Decarby Solar Roof Challenge. Continue to claim your reward below.'
  } else {
    voucherEligibleMessaging = 'We could not confirm this run yet. Please retry verification.'
  }

  const rewardLabel =
    serverVerified && displayReward?.eligible ? displayReward.displayLabel : null
  const rewardAmountCents =
    serverVerified && displayReward?.eligible ? displayReward.amountCents : 0

  return {
    run,
    nickname: run.nickname ?? 'Solar Player',
    totalStars,
    totalScore,
    rewardLabel,
    rewardAmountCents,
    serverVerified,
    voucherEligibleMessaging,
    nextStepLabel: serverVerified ? 'Claim Your Reward' : 'Continue',
  }
}
