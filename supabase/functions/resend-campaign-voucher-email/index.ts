import { loadActiveProfile, requireAuthenticatedUser } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { clientKey, takeRateToken } from '../_shared/rateLimit.ts'
import { deliverVoucherEmail } from '../_shared/rewards/emailDelivery.ts'
import { parseIssuanceConfigRow } from '../_shared/rewards/issuanceConfig.ts'

/**
 * Final B — owner-only email retry. Does not issue a second voucher.
 * Requires authenticated ownership of the claim (email ownership via original claim session).
 * Never resends to an arbitrary third-party address based solely on knowing the email.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  if (!takeRateToken(`resend-campaign-voucher-email:${clientKey(req)}`, { max: 4 })) {
    return publicError(429, 'rate_limited', 'Too many resend requests. Try again shortly.')
  }

  try {
    const auth = await requireAuthenticatedUser(req)
    if ('error' in auth) {
      return publicError(401, 'unauthenticated', 'Sign in required.')
    }

    const profile = await loadActiveProfile(auth.admin, auth.user.id)
    if (!profile) {
      return publicError(403, 'profile_required', 'An active online profile is required.')
    }

    const body = (await req.json().catch(() => null)) as { claimId?: unknown } | null
    const claimId = typeof body?.claimId === 'string' ? body.claimId : ''
    if (claimId.length < 8) {
      return publicError(400, 'invalid_request', 'claimId is required.')
    }

    const { data: claim } = await auth.admin
      .from('promotional_voucher_claims')
      .select('*')
      .eq('id', claimId)
      .maybeSingle()

    if (!claim || claim.player_id !== profile.id) {
      // Anti-enumeration: identical not-found for missing or non-owned claims.
      return publicError(404, 'not_found', 'Voucher claim not found.')
    }

    const { data: voucher } = await auth.admin
      .from('promotional_vouchers')
      .select('*')
      .eq('claim_id', claimId)
      .maybeSingle()

    const { data: job } = await auth.admin
      .from('promotional_voucher_email_jobs')
      .select('*')
      .eq('claim_id', claimId)
      .maybeSingle()

    if (!voucher || !job) {
      return publicError(404, 'not_found', 'Voucher claim not found.')
    }

    const { data: configRow } = await auth.admin
      .from('promotional_issuance_config')
      .select('*')
      .eq('campaign_id', claim.campaign_id)
      .maybeSingle()
    const config = parseIssuanceConfigRow(configRow)

    const delivery = await deliverVoucherEmail({
      toEmail: claim.email_normalized,
      fullName: claim.full_name,
      amountCents: Number(claim.amount_cents),
      voucherCode: voucher.code,
      expiresAtIso: voucher.expires_at,
      demo: voucher.demo === true,
      redeemable: voucher.redeemable === true,
      termsVersion: config.termsVersion,
    })

    await auth.admin.rpc('mark_voucher_email_job_result', {
      p_job_id: job.id,
      p_success: delivery.ok,
      p_provider_message_id: delivery.ok ? delivery.messageId : null,
      p_error: delivery.ok ? null : delivery.error,
    })

    return jsonResponse({
      ok: delivery.ok,
      claimId,
      emailStatus: delivery.ok ? 'sent' : 'failed',
      message: delivery.ok
        ? 'Delivery accepted by the email provider (or demo log). Inbox delivery is not guaranteed.'
        : 'Email delivery failed. The original voucher was preserved for retry.',
      code: delivery.ok ? undefined : 'email_failed',
    })
  } catch (error) {
    console.error('resend-campaign-voucher-email failed', error)
    return publicError(500, 'server_error', 'Could not resend voucher email.')
  }
})
