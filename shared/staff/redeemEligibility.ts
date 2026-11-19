/**
 * Pure client/server mirror of redemption gates.
 * Server SQL remains authoritative; this never enables live offers.
 */

import { isPastVoucherExpiry } from '../rewards/voucherExpiry.ts'

export type StaffVoucherView = Readonly<{
  code: string
  amountCents: number
  currency: string
  campaignId: string
  rewardTierId: string
  issuedAt: string
  /** ISO timestamp, or null when the voucher does not expire. */
  expiresAt: string | null
  status: string
  demo: boolean
  redeemable: boolean
  redeemedAt: string | null
}>

export type StaffDisplayStatus =
  | 'valid'
  | 'redeemed'
  | 'expired'
  | 'void'
  | 'invalid'
  | 'not_redeemable'

export type IssuanceGate = Readonly<{
  mode: string | null
  claimsEnabled: boolean
  realRedeemable: boolean
}>

export function deriveDisplayStatus(
  voucher: Pick<StaffVoucherView, 'status' | 'expiresAt' | 'demo' | 'redeemable'>,
  nowMs: number = Date.now(),
): StaffDisplayStatus {
  if (voucher.status === 'redeemed') return 'redeemed'
  if (voucher.status === 'void') return 'void'
  if (voucher.status === 'expired') return 'expired'
  if (isPastVoucherExpiry(voucher.expiresAt, nowMs)) return 'expired'
  if (voucher.demo || !voucher.redeemable) return 'not_redeemable'
  if (voucher.status === 'issued') return 'valid'
  return 'invalid'
}

export function isLiveIssuanceGate(gate: IssuanceGate | null | undefined): boolean {
  return (
    !!gate &&
    gate.mode === 'approved_live' &&
    gate.claimsEnabled === true &&
    gate.realRedeemable === true
  )
}

/** Whether the Redeem button may be offered (UI only — server still decides). */
export function canOfferRedeem(
  voucher: StaffVoucherView,
  gate: IssuanceGate | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (deriveDisplayStatus(voucher, nowMs) !== 'valid') return false
  return isLiveIssuanceGate(gate)
}
