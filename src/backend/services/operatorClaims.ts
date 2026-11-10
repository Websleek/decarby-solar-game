import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'
import type { ClaimApprovalMeaning } from '../../../shared/rewards/voucherPrep'

export type OperatorPendingClaim = Readonly<{
  claimId: string
  playerId: string
  publicNickname: string
  rewardId: string
  rewardSlug: string
  rewardTitle: string
  campaignId: string
  status: string
  createdAt: string
  eligibilitySnapshot: Record<string, unknown>
}>

export type OperatorClaimDetail = Readonly<{
  claim: OperatorPendingClaim &
    Readonly<{
      claimPolicy: string
      updatedAt: string
      decidedAt: string | null
    }>
  audits: readonly Readonly<{
    auditId: string
    eventType: string
    actorRole: string
    payload: Record<string, unknown>
    createdAt: string
  }>[]
  approvalMeaning: ClaimApprovalMeaning
  canIssueVouchers: false
}>

function requireClient() {
  if (!isBackendConfigured()) {
    throw new BackendError('not_configured', 'Operator tools need Supabase credentials.')
  }
  const client = getSupabaseClient()
  if (!client) throw new BackendError('not_configured', 'Operator tools are not configured.')
  return client
}

async function invokeOperator<T>(body: Record<string, unknown>): Promise<T> {
  const client = requireClient()
  const auth = await identityService.ensureAnonymousSession()
  if (auth.kind !== 'anonymous') {
    throw new BackendError('unauthenticated', 'Sign in required for operator tools.')
  }
  const { data, error } = await client.functions.invoke('operator-claims', { body })
  if (error) throw toBackendError(error, 'Operator request failed.')
  return data as T
}

export const operatorClaimsService = {
  async checkAccess(): Promise<boolean> {
    try {
      const payload = await invokeOperator<{ ok?: boolean; operator?: boolean }>({
        action: 'access',
      })
      return payload?.ok === true && payload.operator === true
    } catch (error) {
      if (error instanceof BackendError && error.code === 'unauthorized') return false
      // Functions may return 403 as a FunctionsHttpError — treat as not an operator.
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (message.includes('403') || message.includes('operator')) return false
      return false
    }
  },

  async listPending(limit = 50): Promise<readonly OperatorPendingClaim[]> {
    const payload = await invokeOperator<{
      ok?: boolean
      claims?: OperatorPendingClaim[]
      message?: string
    }>({ action: 'list_pending', limit })
    if (!payload?.ok) {
      throw new BackendError('unauthorized', payload?.message ?? 'Operator access required.')
    }
    return payload.claims ?? []
  },

  async getClaim(claimId: string): Promise<OperatorClaimDetail> {
    const payload = await invokeOperator<{
      ok?: boolean
      claim?: OperatorClaimDetail['claim']
      audits?: OperatorClaimDetail['audits']
      approvalMeaning?: ClaimApprovalMeaning
      message?: string
    }>({ action: 'get', claimId })
    if (!payload?.ok || !payload.claim) {
      throw new BackendError('unknown', payload?.message ?? 'Could not load claim.')
    }
    return {
      claim: payload.claim,
      audits: payload.audits ?? [],
      approvalMeaning: payload.approvalMeaning ?? {
        reviewedApproved: true,
        voucherIssued: false,
        redeemed: false,
        paid: false,
      },
      canIssueVouchers: false,
    }
  },

  async review(
    claimId: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ): Promise<Readonly<{ claimId: string; fromStatus: string; toStatus: string }>> {
    const payload = await invokeOperator<{
      ok?: boolean
      claimId?: string
      fromStatus?: string
      toStatus?: string
      message?: string
      code?: string
      voucherIssued?: boolean
      redeemed?: boolean
    }>({ action: 'review', claimId, decision, reason })
    if (!payload?.ok) {
      throw new BackendError(
        payload?.code === 'invalid_transition' ? 'conflict' : 'validation',
        payload?.message ?? 'Review failed.',
      )
    }
    if (payload.voucherIssued === true || payload.redeemed === true) {
      throw new BackendError('unsupported', 'Unexpected voucher/redemption side effect.')
    }
    return {
      claimId: String(payload.claimId),
      fromStatus: String(payload.fromStatus),
      toStatus: String(payload.toStatus),
    }
  },
}
