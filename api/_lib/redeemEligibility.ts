export type StaffVoucherView = Readonly<{
  code: string
  amountCents: number
  currency: string
  campaignId: string
  rewardTierId: string
  issuedAt: string
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

function isPastExpiry(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (expiresAt == null) return false
  const trimmed = String(expiresAt).trim()
  if (!trimmed || trimmed === 'null') return false
  const ms = Date.parse(trimmed)
  if (Number.isNaN(ms)) return false
  return ms <= nowMs
}

export function deriveDisplayStatus(
  voucher: Pick<StaffVoucherView, 'status' | 'expiresAt' | 'demo' | 'redeemable'>,
  nowMs: number = Date.now(),
): StaffDisplayStatus {
  if (voucher.status === 'redeemed') return 'redeemed'
  if (voucher.status === 'void') return 'void'
  if (voucher.status === 'expired') return 'expired'
  if (isPastExpiry(voucher.expiresAt, nowMs)) return 'expired'
  if (voucher.demo || !voucher.redeemable) return 'not_redeemable'
  if (voucher.status === 'issued') return 'valid'
  return 'invalid'
}
