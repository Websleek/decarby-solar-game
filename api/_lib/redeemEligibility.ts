export type StaffVoucherView = Readonly<{
  code: string
  amountCents: number
  currency: string
  campaignId: string
  rewardTierId: string
  issuedAt: string
  expiresAt: string
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

export function deriveDisplayStatus(
  voucher: Pick<StaffVoucherView, 'status' | 'expiresAt' | 'demo' | 'redeemable'>,
  nowMs: number = Date.now(),
): StaffDisplayStatus {
  if (voucher.status === 'redeemed') return 'redeemed'
  if (voucher.status === 'void') return 'void'
  if (voucher.status === 'expired') return 'expired'
  const expires = Date.parse(voucher.expiresAt)
  if (!Number.isNaN(expires) && expires <= nowMs) return 'expired'
  if (voucher.demo || !voucher.redeemable) return 'not_redeemable'
  if (voucher.status === 'issued') return 'valid'
  return 'invalid'
}
