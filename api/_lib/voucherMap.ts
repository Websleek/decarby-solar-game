import type { StaffVoucherView } from './redeemEligibility'
import { deriveDisplayStatus } from './redeemEligibility'

function mapExpiresAt(raw: unknown): string | null {
  if (raw == null) return null
  const value = String(raw).trim()
  if (!value || value === 'null' || value === 'undefined') return null
  return value
}

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
    expiresAt: mapExpiresAt(raw.expiresAt ?? raw.expires_at),
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
  const canRedeem =
    displayStatus === 'valid' && voucher.redeemable === true && voucher.demo === false
  return { ...voucher, displayStatus, canRedeem }
}
