import type { StaffVoucherView } from '../../shared/staff/redeemEligibility'
import { deriveDisplayStatus } from '../../shared/staff/redeemEligibility'

export function mapVoucherRow(raw: Record<string, unknown> | null | undefined): StaffVoucherView | null {
  if (!raw || typeof raw !== 'object') return null
  const code = typeof raw.code === 'string' ? raw.code : null
  if (!code) return null
  return {
    code,
    amountCents: Number(raw.amountCents ?? raw.amount_cents ?? 0),
    currency: String(raw.currency ?? 'AUD'),
    campaignId: String(raw.campaignId ?? raw.campaign_id ?? ''),
    rewardTierId: String(raw.rewardTierId ?? raw.reward_tier_id ?? ''),
    issuedAt: String(raw.issuedAt ?? raw.issued_at ?? ''),
    expiresAt: String(raw.expiresAt ?? raw.expires_at ?? ''),
    status: String(raw.status ?? ''),
    demo: raw.demo === true,
    redeemable: raw.redeemable === true,
    redeemedAt:
      raw.redeemedAt == null && raw.redeemed_at == null
        ? null
        : String(raw.redeemedAt ?? raw.redeemed_at),
  }
}

export function withUiStatus(voucher: StaffVoucherView): StaffVoucherView & {
  displayStatus: ReturnType<typeof deriveDisplayStatus>
  canRedeem: boolean
} {
  const displayStatus = deriveDisplayStatus(voucher)
  // UI offer flag — still gated by server redeem RPC (live issuance + flags).
  const canRedeem =
    displayStatus === 'valid' && voucher.redeemable === true && voucher.demo === false
  return { ...voucher, displayStatus, canRedeem }
}
