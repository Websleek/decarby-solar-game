/**
 * Final B — voucher claim workflow types and pure helpers.
 * Issuance mutations happen only via service-role Edge + SQL RPC.
 */

export const VOUCHER_CLAIM_STATUSES = [
  'pending',
  'issued',
  'email_queued',
  'email_sent',
  'email_failed',
  'redeemed',
  'expired',
  'void',
] as const
export type VoucherClaimStatus = (typeof VOUCHER_CLAIM_STATUSES)[number]

export const EMAIL_JOB_STATUSES = ['queued', 'sent', 'failed'] as const
export type EmailJobStatus = (typeof EMAIL_JOB_STATUSES)[number]

export type ClaimCampaignVoucherRequest = Readonly<{
  runId: string
  fullName: string
  phone: string
  email: string
  termsAccepted: true
  adultSelfAttested: true
  marketingOptIn: boolean
  termsVersion: string
}>

export type ClaimCampaignVoucherSuccess = Readonly<{
  ok: true
  idempotent: boolean
  claimId: string
  voucherId: string
  emailJobId: string
  code: string
  amountCents: number
  tierId: string
  expiresAt: string
  demo: boolean
  redeemable: boolean
  issuanceMode: 'demo' | 'approved_live'
  claimStatus: VoucherClaimStatus
  emailStatus: EmailJobStatus
  /** demo_log | resend | unknown — never treat demo_log as inbox delivery. */
  emailProvider: 'demo_log' | 'resend' | 'unknown'
  message: string
}>

export type ClaimCampaignVoucherFailure = Readonly<{
  ok: false
  code: string
  message: string
}>

export type ClaimCampaignVoucherResult = ClaimCampaignVoucherSuccess | ClaimCampaignVoucherFailure

/** Client-submitted amount must never authorize issuance. */
export function rejectClientAmountAuthority(body: {
  amountCents?: unknown
  discountAmount?: unknown
  rewardAmountCents?: unknown
}): void {
  // Pure documentation helper used in tests — Edge ignores these fields.
  void body.amountCents
  void body.discountAmount
  void body.rewardAmountCents
}

export function successMessage(result: {
  demo: boolean
  redeemable: boolean
  idempotent: boolean
}): string {
  if (result.demo || !result.redeemable) {
    return result.idempotent
      ? 'Your voucher request has been processed. Demo mode: no redeemable discount has been issued.'
      : 'Your voucher request has been processed. Demo mode: no redeemable discount has been issued.'
  }
  return result.idempotent
    ? 'Your voucher request has already been processed.'
    : 'Your voucher request has been processed.'
}

/**
 * In-memory uniqueness model for concurrent duplicate tests (mirrors DB constraint).
 */
export class InMemoryEmailClaimLedger {
  private readonly byEmail = new Map<string, { playerId: string; runId: string; claimId: string }>()
  private readonly byRun = new Map<string, string>()

  tryReserve(input: {
    campaignId: string
    emailNormalized: string
    playerId: string
    runId: string
  }):
    | { ok: true; claimId: string; idempotent: boolean }
    | { ok: false; code: 'email_already_used' } {
    const emailKey = `${input.campaignId}::${input.emailNormalized}`
    const existingRun = this.byRun.get(input.runId)
    if (existingRun) {
      return { ok: true, claimId: existingRun, idempotent: true }
    }
    const existingEmail = this.byEmail.get(emailKey)
    if (existingEmail) {
      if (existingEmail.playerId === input.playerId && existingEmail.runId === input.runId) {
        return { ok: true, claimId: existingEmail.claimId, idempotent: true }
      }
      return { ok: false, code: 'email_already_used' }
    }
    const claimId = crypto.randomUUID()
    this.byEmail.set(emailKey, {
      playerId: input.playerId,
      runId: input.runId,
      claimId,
    })
    this.byRun.set(input.runId, claimId)
    return { ok: true, claimId, idempotent: false }
  }
}
