/**
 * Event voucher CTA readiness — never silently disable without feedback.
 */

import { validateVoucherContactForm } from './contactValidation.ts'
import { PROMOTIONAL_TERMS_VERSION } from './consent.ts'

export type VoucherSubmitFormSnapshot = Readonly<{
  fullName: string
  phone: string
  email: string
  termsAccepted: boolean
  marketingOptIn?: boolean
}>

export type VoucherCampaignGate = Readonly<{
  serverVerified: boolean
  rewardAmountCents: number
  serverBacked: boolean
  provisional: boolean
  alreadyClaimed: boolean
  busy: boolean
}>

export type VoucherSubmitReadiness = Readonly<{
  campaignReady: boolean
  formReady: boolean
  canSubmit: boolean
  blockers: readonly string[]
}>

export function evaluateVoucherSubmitReadiness(
  campaign: VoucherCampaignGate,
  form: VoucherSubmitFormSnapshot,
): VoucherSubmitReadiness {
  const blockers: string[] = []

  if (campaign.busy) {
    blockers.push('Your voucher request is already being prepared.')
  }
  if (campaign.alreadyClaimed) {
    blockers.push('A voucher has already been claimed for this campaign run.')
  }
  if (!campaign.serverBacked) {
    blockers.push(
      'This session is offline or not server-backed. Start an online verified challenge to claim.',
    )
  } else if (campaign.provisional || !campaign.serverVerified) {
    blockers.push(
      'Campaign results are not fully server-verified yet. Wait for verification or retry if the network failed.',
    )
  }
  if (campaign.rewardAmountCents <= 0) {
    blockers.push(
      'Your reward is still unlocking. Finish verification for this completed run, then try again.',
    )
  }

  const campaignReady =
    campaign.serverBacked &&
    campaign.serverVerified &&
    !campaign.provisional &&
    campaign.rewardAmountCents > 0 &&
    !campaign.alreadyClaimed &&
    !campaign.busy

  const validated = validateVoucherContactForm({
    fullName: form.fullName,
    phone: form.phone,
    email: form.email,
    termsAccepted: form.termsAccepted,
    // Adult checkbox removed from event UI — do not fabricate attestation.
    adultSelfAttested: false,
    marketingOptIn: form.marketingOptIn === true,
    termsVersion: PROMOTIONAL_TERMS_VERSION,
  })

  if (!validated.ok) {
    blockers.push(validated.reason)
  }

  const formReady = validated.ok
  const canSubmit = campaignReady && formReady

  return {
    campaignReady,
    formReady,
    canSubmit,
    blockers: Object.freeze([...new Set(blockers)]),
  }
}
