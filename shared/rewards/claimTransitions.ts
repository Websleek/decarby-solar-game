import type { ClaimStatus } from './types.ts'

/**
 * Explicitly allowed claim status transitions (Phase 4C.2).
 * Redeemed is never implied by a claim request — only via a future authorised redemption step.
 */
export const ALLOWED_CLAIM_TRANSITIONS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> =
  Object.freeze({
    pending: Object.freeze(['approved', 'rejected', 'cancelled', 'expired'] as const),
    approved: Object.freeze(['redeemed', 'cancelled', 'expired'] as const),
    rejected: Object.freeze([] as const),
    redeemed: Object.freeze([] as const),
    expired: Object.freeze([] as const),
    cancelled: Object.freeze([] as const),
  })

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus): boolean {
  if (from === to) return false
  return ALLOWED_CLAIM_TRANSITIONS[from].includes(to)
}

export function assertClaimTransition(from: ClaimStatus, to: ClaimStatus): void {
  if (!canTransitionClaim(from, to)) {
    throw new Error(`Invalid claim transition: ${from} -> ${to}`)
  }
}

/** Statuses that consume campaign capacity / per-player inventory. */
export function isCapacityConsumingClaimStatus(status: ClaimStatus): boolean {
  return status === 'pending' || status === 'approved' || status === 'redeemed'
}
