import {
  createLocalCampaignRun,
  finalizeCampaignReward,
  applyLocalLevelComplete,
  applyVerifiedLevelResult,
  toCampaignCompleteView,
} from '../../../shared/campaign/runFactory'
import type { CampaignLevelId } from '../../../shared/achievements/registry'
import type { CampaignCompleteView, PromotionalCampaignRun } from '../../../shared/campaign/types'
import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'
import { profileService } from './profile'

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient()
  if (!client) throw new BackendError('not_configured', 'Online campaign service unavailable.')
  const auth = await identityService.ensureAnonymousSession()
  if (auth.kind !== 'anonymous') {
    throw new BackendError('unauthenticated', 'Sign in anonymously to continue.')
  }
  const { data, error } = await client.functions.invoke(name, { body })
  if (error) throw toBackendError(error, 'Campaign request failed.')
  return data as T
}

export const promotionalCampaignService = {
  createOfflineRun(nickname: string | null): PromotionalCampaignRun {
    return createLocalCampaignRun({
      id: crypto.randomUUID(),
      nickname,
      serverBacked: false,
    })
  },

  async startServerRun(nickname: string): Promise<PromotionalCampaignRun> {
    if (!isBackendConfigured()) {
      return this.createOfflineRun(nickname)
    }
    try {
      await profileService.upsertMyNickname(nickname)
      const profile = await profileService.getMyProfile()
      const payload = await invokeFunction<{
        ok?: boolean
        runId?: string
        createdAt?: string
        message?: string
        code?: string
      }>('start-campaign-run', {})
      if (!payload?.ok || !payload.runId) {
        // Migration / function not deployed — continue with local provisional run.
        return createLocalCampaignRun({
          id: crypto.randomUUID(),
          nickname,
          playerId: profile?.id ?? null,
          serverBacked: false,
        })
      }
      return createLocalCampaignRun({
        id: payload.runId,
        nickname: profile?.publicNickname ?? nickname,
        playerId: profile?.id ?? null,
        serverBacked: true,
        nowIso: payload.createdAt,
      })
    } catch {
      return this.createOfflineRun(nickname)
    }
  },

  recordLocalComplete(
    run: PromotionalCampaignRun,
    input: { levelId: CampaignLevelId; stars: number; score: number },
  ): PromotionalCampaignRun {
    return applyLocalLevelComplete(run, input)
  },

  recordVerified(
    run: PromotionalCampaignRun,
    input: {
      levelId: CampaignLevelId
      stars: number
      score: number
      verifiedRecordId: string
      verifiedAttemptId?: string | null
      levelVersion?: number
    },
  ): PromotionalCampaignRun {
    return applyVerifiedLevelResult(run, {
      levelId: input.levelId,
      stars: input.stars,
      score: input.score,
      verifiedRecordId: input.verifiedRecordId,
      verifiedAttemptId: input.verifiedAttemptId ?? null,
      levelVersion: input.levelVersion ?? 1,
    })
  },

  finalizeLocal(run: PromotionalCampaignRun): PromotionalCampaignRun {
    return finalizeCampaignReward(run)
  },

  async evaluateServer(run: PromotionalCampaignRun): Promise<PromotionalCampaignRun> {
    if (!run.serverBacked || !isBackendConfigured()) {
      return finalizeCampaignReward(run)
    }
    try {
      const payload = await invokeFunction<{
        ok?: boolean
        eligible?: boolean
        amountCents?: number
        tierId?: string | null
        totalStars?: number
        totalScore?: number
        decision?: PromotionalCampaignRun['reward']
        voucherIssued?: boolean
        message?: string
      }>('evaluate-campaign-run', { runId: run.id })
      if (!payload?.ok || !payload.decision) {
        return finalizeCampaignReward(run)
      }
      if (payload.voucherIssued === true) {
        throw new BackendError('unsupported', 'Unexpected voucher issuance in Final A.')
      }
      return {
        ...run,
        reward: payload.decision,
        rewardTierId: payload.decision.eligible ? payload.decision.tierId : null,
        status: payload.decision.eligible ? 'reward_calculated' : 'ineligible',
        completedAt: new Date().toISOString(),
        provisional: false,
        serverBacked: true,
      }
    } catch {
      return finalizeCampaignReward({ ...run, provisional: true })
    }
  },

  toView(run: PromotionalCampaignRun): CampaignCompleteView {
    return toCampaignCompleteView(run)
  },
}
