/**
 * Session-scoped cache of a successful voucher claim for interruption recovery.
 * Cleared on New Player reset. Never written to localStorage (shared-device privacy).
 */

import type { ClaimCampaignVoucherSuccess } from '../../shared/rewards/voucherClaim'

export const CLAIM_RESULT_SESSION_KEY = 'decarby-solar-claim-result'

type CachedClaim = Readonly<{
  runId: string
  result: ClaimCampaignVoucherSuccess
  savedAt: string
}>

function canUseSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined'
  } catch {
    return false
  }
}

export function readCachedClaimResult(runId: string): ClaimCampaignVoucherSuccess | null {
  if (!canUseSessionStorage() || !runId) return null
  try {
    const raw = sessionStorage.getItem(CLAIM_RESULT_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedClaim
    if (!parsed || parsed.runId !== runId || parsed.result?.ok !== true) return null
    return parsed.result
  } catch {
    return null
  }
}

export function writeCachedClaimResult(
  runId: string,
  result: ClaimCampaignVoucherSuccess,
): void {
  if (!canUseSessionStorage() || !runId || result.ok !== true) return
  try {
    const payload: CachedClaim = {
      runId,
      result,
      savedAt: new Date().toISOString(),
    }
    sessionStorage.setItem(CLAIM_RESULT_SESSION_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private-mode failures — claim remains server-idempotent.
  }
}

export function clearCachedClaimResult(): void {
  if (!canUseSessionStorage()) return
  try {
    sessionStorage.removeItem(CLAIM_RESULT_SESSION_KEY)
  } catch {
    // ignore
  }
}
