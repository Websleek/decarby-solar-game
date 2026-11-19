import { loadActiveProfile, requireAuthenticatedUser } from '../_shared/auth.ts'
import {
  evaluateVerifiedLevelRows,
  needsRewardDecisionReconcile,
} from '../_shared/campaign/rewardDecisionReconcile.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { clientKey, takeRateToken } from '../_shared/rateLimit.ts'
import { validateVoucherContactForm } from '../_shared/rewards/contactValidation.ts'
import { deliverVoucherEmail } from '../_shared/rewards/emailDelivery.ts'
import { parseIssuanceConfigRow } from '../_shared/rewards/issuanceConfig.ts'
import { successMessage } from '../_shared/rewards/voucherClaim.ts'
import { generateVoucherCode } from '../_shared/rewards/voucherCode.ts'

/**
 * Final B — authenticated campaign voucher claim + transactional email.
 * Reward amount is taken only from server-verified promotional_campaign_reward_decisions.
 * Client-submitted amountCents / discount fields are ignored.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  if (!takeRateToken(`claim-campaign-voucher:${clientKey(req)}`, { max: 8 })) {
    return publicError(429, 'rate_limited', 'Too many voucher requests. Try again shortly.')
  }

  try {
    const auth = await requireAuthenticatedUser(req)
    if ('error' in auth) {
      return publicError(401, 'unauthenticated', 'Sign in required to claim a voucher.')
    }

    const profile = await loadActiveProfile(auth.admin, auth.user.id)
    if (!profile) {
      return publicError(403, 'profile_required', 'An active online profile is required.')
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return publicError(400, 'invalid_request', 'Invalid request body.')
    }

    const runId = typeof body.runId === 'string' ? body.runId : ''
    if (runId.length < 8) {
      return publicError(400, 'invalid_request', 'runId is required.')
    }

    // Ignore client reward tampering fields — amount comes from DB decision only.
    void body.amountCents
    void body.discountAmount
    void body.rewardAmountCents
    void body.voucherCode

    const { data: run } = await auth.admin
      .from('promotional_campaign_runs')
      .select('id, player_id, campaign_id, status, reward_eligible')
      .eq('id', runId)
      .maybeSingle()

    if (!run || run.player_id !== profile.id) {
      return publicError(404, 'run_not_found', 'Campaign run not found.')
    }

    const { data: configRow } = await auth.admin
      .from('promotional_issuance_config')
      .select('*')
      .eq('campaign_id', run.campaign_id)
      .maybeSingle()

    const config = parseIssuanceConfigRow(configRow)
    if (!config.claimsEnabled) {
      return publicError(403, 'claims_disabled', 'Voucher claims are not enabled for this campaign.')
    }

    const validated = validateVoucherContactForm(
      {
        fullName: body.fullName,
        phone: body.phone,
        email: body.email,
        termsAccepted: body.termsAccepted,
        adultSelfAttested: body.adultSelfAttested,
        marketingOptIn: body.marketingOptIn,
        termsVersion: body.termsVersion,
      },
      config.termsVersion,
    )
    if (!validated.ok) {
      return publicError(400, validated.code, validated.reason)
    }

    let { data: decision } = await auth.admin
      .from('promotional_campaign_reward_decisions')
      .select('id, eligible, amount_cents, tier_id, player_id, total_stars, voucher_issued, decision')
      .eq('run_id', runId)
      .maybeSingle()

    // Repair stale ineligible decisions for completed verified event runs (e.g. 5/9 → A$50)
    // without trusting client-submitted amounts.
    if (!decision?.eligible || !decision.tier_id || Number(decision.amount_cents) <= 0) {
      const { data: levels } = await auth.admin
        .from('promotional_campaign_run_levels')
        .select(
          'status, level_id, verified_stars, verified_score, verified_record_id, level_version',
        )
        .eq('run_id', runId)
      const fresh = evaluateVerifiedLevelRows(levels ?? [])
      const { data: existingClaim } = await auth.admin
        .from('promotional_voucher_claims')
        .select('id')
        .eq('run_id', runId)
        .maybeSingle()

      if (needsRewardDecisionReconcile(decision, fresh, existingClaim != null) && fresh.eligible) {
        const { data: reconciled, error: reconcileError } = await auth.admin.rpc(
          'reconcile_campaign_reward_decision',
          {
            p_run_id: runId,
            p_player_id: profile.id,
            p_eligible: true,
            p_tier_id: fresh.tierId,
            p_amount_cents: fresh.amountCents,
            p_total_stars: fresh.totalStars,
            p_total_score: fresh.totalScore,
            p_decision: fresh,
          },
        )
        if (reconcileError) {
          console.error('claim reconcile failed', reconcileError.message)
          return publicError(
            500,
            'server_error',
            'Could not reconcile reward decision. Apply reward-decision reconcile migration.',
          )
        }
        const payload = (reconciled ?? {}) as Record<string, unknown>
        if (payload.ok === true && payload.eligible === true) {
          decision = {
            id: String(payload.decisionId ?? decision?.id ?? ''),
            eligible: true,
            amount_cents: Number(payload.amountCents ?? 0),
            tier_id: typeof payload.tierId === 'string' ? payload.tierId : null,
            player_id: profile.id,
            total_stars: Number(payload.totalStars ?? 0),
            voucher_issued: false,
            decision: payload.decision,
          }
        }
      }
    }

    if (!decision) {
      return publicError(
        400,
        'unverified_result',
        'Campaign reward has not been server-verified yet.',
      )
    }
    if (decision.player_id !== profile.id) {
      return publicError(403, 'forbidden', 'Campaign run does not belong to this player.')
    }
    if (!decision.eligible || !decision.tier_id || Number(decision.amount_cents) <= 0) {
      return publicError(400, 'not_eligible', 'This campaign run is not eligible for a voucher.')
    }

    const voucherCode = generateVoucherCode({ demo: config.mode === 'demo' })

    const { data: issued, error: issueError } = await auth.admin.rpc(
      'issue_campaign_voucher_claim',
      {
        p_player_id: profile.id,
        p_run_id: runId,
        p_email_raw: validated.value.emailRaw,
        p_email_normalized: validated.value.emailNormalized,
        p_full_name: validated.value.fullName,
        p_phone: validated.value.phone,
        p_terms_version: validated.value.termsVersion,
        p_adult_self_attested: validated.value.adultSelfAttested,
        p_marketing_opt_in: validated.value.marketingOptIn,
        p_voucher_code: voucherCode,
      },
    )

    if (issueError) {
      console.error('issue_campaign_voucher_claim failed', issueError.message)
      return publicError(500, 'claim_failed', 'Could not process voucher claim.')
    }

    const result = (issued ?? {}) as Record<string, unknown>
    if (result.ok !== true) {
      const code = typeof result.code === 'string' ? result.code : 'claim_failed'
      const message =
        typeof result.message === 'string'
          ? result.message
          : 'Could not process voucher claim.'
      const status =
        code === 'email_already_used'
          ? 409
          : code === 'forbidden' || code === 'claims_disabled'
            ? 403
            : 400
      return publicError(status, code, message)
    }

    const emailJobId = String(result.emailJobId ?? '')
    const code = String(result.code ?? '')
    const amountCents = Number(result.amountCents ?? 0)
    const expiresAt =
      result.expiresAt == null || result.expiresAt === ''
        ? null
        : String(result.expiresAt)
    const demo = result.demo === true
    const redeemable = result.redeemable === true
    const idempotent = result.idempotent === true
    const emailStatus = String(result.emailStatus ?? 'queued')
    const toEmail =
      typeof result.emailNormalized === 'string' && result.emailNormalized.length > 0
        ? result.emailNormalized
        : validated.value.emailNormalized
    const fullName =
      typeof result.fullName === 'string' && result.fullName.length > 0
        ? result.fullName
        : validated.value.fullName

    // Deliver (or retry) without creating another voucher.
    let deliveryStatus = emailStatus
    let emailProvider: 'demo_log' | 'resend' | 'unknown' = 'unknown'
    if (emailJobId && emailStatus !== 'sent') {
      const delivery = await deliverVoucherEmail({
        toEmail,
        fullName,
        amountCents,
        voucherCode: code,
        expiresAtIso: expiresAt,
        demo,
        redeemable,
        termsVersion: config.termsVersion,
        totalStars:
          typeof decision.total_stars === 'number' ? Number(decision.total_stars) : undefined,
        emailJobId,
      })

      await auth.admin.rpc('mark_voucher_email_job_result', {
        p_job_id: emailJobId,
        p_success: delivery.ok,
        p_provider_message_id: delivery.ok ? delivery.messageId : null,
        p_error: delivery.ok ? null : delivery.error,
      })
      await auth.admin
        .from('promotional_voucher_email_jobs')
        .update({ provider: delivery.provider })
        .eq('id', emailJobId)
      deliveryStatus = delivery.ok ? 'sent' : 'failed'
      emailProvider =
        delivery.provider === 'demo_log'
          ? 'demo_log'
          : delivery.provider === 'resend'
            ? 'resend'
            : 'unknown'
    } else if (emailStatus === 'sent') {
      const { data: priorJob } = await auth.admin
        .from('promotional_voucher_email_jobs')
        .select('provider')
        .eq('id', emailJobId)
        .maybeSingle()
      emailProvider =
        priorJob?.provider === 'resend'
          ? 'resend'
          : priorJob?.provider === 'demo_log'
            ? 'demo_log'
            : demo || !redeemable
              ? 'demo_log'
              : 'resend'
    }

    const message = successMessage({ demo, redeemable, idempotent })

    return jsonResponse({
      ok: true,
      idempotent,
      claimId: result.claimId,
      voucherId: result.voucherId,
      emailJobId,
      // Demo may return code to the authenticated claimant for UX; never public boards.
      code: demo || redeemable ? code : code,
      amountCents,
      tierId: result.tierId,
      expiresAt,
      demo,
      redeemable,
      issuanceMode: result.issuanceMode,
      claimStatus: deliveryStatus === 'sent' ? 'email_sent' : deliveryStatus === 'failed' ? 'email_failed' : result.claimStatus,
      emailStatus: deliveryStatus,
      emailProvider,
      nickname: profile.public_nickname,
      message,
    })
  } catch (error) {
    console.error('claim-campaign-voucher failed', error)
    return publicError(500, 'server_error', 'Could not process voucher claim.')
  }
})
