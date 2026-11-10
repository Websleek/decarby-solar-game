import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'

export type PlayerClaimSummary = Readonly<{
  claimId: string
  rewardId: string
  rewardSlug: string
  rewardTitle: string
  campaignId: string
  status: string
  createdAt: string
  updatedAt: string
  decidedAt: string | null
  canRequestClaim: false
  voucherIssued: false
}>

function requireClient() {
  if (!isBackendConfigured()) {
    throw new BackendError('not_configured', 'Online claims need Supabase credentials.')
  }
  const client = getSupabaseClient()
  if (!client) throw new BackendError('not_configured', 'Online claims are not configured.')
  return client
}

export const playerClaimsService = {
  /**
   * Read-only claim history for the authenticated player.
   * Does not enable public claiming or show actionable claim buttons.
   */
  async listMine(): Promise<readonly PlayerClaimSummary[]> {
    const client = requireClient()
    const auth = await identityService.ensureAnonymousSession()
    if (auth.kind !== 'anonymous') {
      throw new BackendError('unauthenticated', 'Sign in to view claim history.')
    }

    const { data, error } = await client.functions.invoke('list-my-claims', { body: {} })
    if (error) throw toBackendError(error, 'Could not load claim history.')
    const payload = data as {
      ok?: boolean
      claims?: PlayerClaimSummary[]
      message?: string
      publicClaimingEnabled?: boolean
    }
    if (!payload?.ok) {
      throw new BackendError('unknown', payload?.message ?? 'Could not load claim history.')
    }
    if (payload.publicClaimingEnabled === true) {
      // Fail closed if a misconfigured backend ever advertises public claiming.
      throw new BackendError('unsupported', 'Public claiming must remain disabled.')
    }
    return (payload.claims ?? []).map((row) => ({
      ...row,
      canRequestClaim: false as const,
      voucherIssued: false as const,
    }))
  },
}
