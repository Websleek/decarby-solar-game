/**
 * Phase 4C.3 — typed boundaries for future voucher issuance / redemption.
 * No codes are generated. Approval ≠ issued ≠ redeemed ≠ paid.
 */

export const VOUCHER_LIFECYCLE_STATUSES = [
  'reserved',
  'issued',
  'expired',
  'redeemed',
  'void',
] as const
export type VoucherLifecycleStatus = (typeof VOUCHER_LIFECYCLE_STATUSES)[number]

export type FutureVoucherIntent = Readonly<{
  claimId: string
  rewardId: string
  playerId: string
  /** Always false in 4C.3 — codes are never materialised. */
  codeIssued: false
  lifecycleStatus: Extract<VoucherLifecycleStatus, 'reserved'>
  expiresAt: string | null
  monetaryValueCents: number | null
  currency: 'AUD'
}>

export type ClaimApprovalMeaning = Readonly<{
  /** Operator reviewed and approved the claim request. */
  reviewedApproved: true
  /** No discount/voucher code has been generated. */
  voucherIssued: false
  /** No payment or redemption has occurred. */
  redeemed: false
  paid: false
}>

export function approvalDoesNotIssueVoucher(): ClaimApprovalMeaning {
  return {
    reviewedApproved: true,
    voucherIssued: false,
    redeemed: false,
    paid: false,
  }
}

export function assertNoVoucherIssuanceInPhase4C3(intent: {
  codeIssued?: boolean
  lifecycleStatus?: string
}): void {
  if (intent.codeIssued === true) {
    throw new Error('Voucher code issuance is disabled in Phase 4C.3.')
  }
  if (intent.lifecycleStatus && intent.lifecycleStatus !== 'reserved') {
    throw new Error('Only reserved voucher intents are allowed in Phase 4C.3.')
  }
}
