import { CAMPAIGN_LEVEL_IDS } from '../_shared/achievements/registry.ts'
import {
  evaluateVerifiedLevelRows,
  needsRewardDecisionReconcile,
} from '../_shared/campaign/rewardDecisionReconcile.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

/**
 * Idempotent campaign reward evaluation from verified run-associated Classic results.
 * Never issues voucher codes.
 * Stale ineligible decisions (pre-event tiers / incomplete snapshots) are reconciled
 * via reconcile_campaign_reward_decision when no claim exists.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return publicError(401, 'unauthenticated', 'Sign in required.')

    const body = (await req.json().catch(() => null)) as { runId?: unknown } | null
    if (!body || typeof body.runId !== 'string' || body.runId.length < 8) {
      return publicError(400, 'invalid_request', 'runId is required.')
    }

    const userClient = createUserClient(authHeader)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return publicError(401, 'unauthenticated', 'Sign in required.')

    const admin = createServiceClient()
    const { data: profile } = await admin
      .from('player_profiles')
      .select('id, moderation_status, public_nickname')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile || profile.moderation_status !== 'active') {
      return publicError(403, 'profile_required', 'Online profile required.')
    }

    const { data: run } = await admin
      .from('promotional_campaign_runs')
      .select('*')
      .eq('id', body.runId)
      .maybeSingle()
    if (!run || run.player_id !== profile.id) {
      return publicError(404, 'not_found', 'Campaign run not found.')
    }

    const { data: levels, error: levelsError } = await admin
      .from('promotional_campaign_run_levels')
      .select('*')
      .eq('run_id', body.runId)
    if (levelsError) {
      return publicError(500, 'server_error', 'Could not load campaign levels.')
    }

    const decision = evaluateVerifiedLevelRows(levels ?? [])

    const { data: existingDecision } = await admin
      .from('promotional_campaign_reward_decisions')
      .select('*')
      .eq('run_id', body.runId)
      .maybeSingle()

    const { data: existingClaim } = await admin
      .from('promotional_voucher_claims')
      .select('id')
      .eq('run_id', body.runId)
      .maybeSingle()

    if (
      existingDecision &&
      !needsRewardDecisionReconcile(existingDecision, decision, existingClaim != null)
    ) {
      return jsonResponse({
        ok: true,
        idempotent: true,
        voucherIssued: false,
        decision: existingDecision.decision,
        eligible: existingDecision.eligible,
        tierId: existingDecision.tier_id,
        amountCents: existingDecision.amount_cents,
        totalStars: existingDecision.total_stars,
        totalScore: existingDecision.total_score,
        nickname: profile.public_nickname,
        levelsExpected: CAMPAIGN_LEVEL_IDS.length,
        levelsVerified: (levels ?? []).filter((row) => row.status === 'verified').length,
      })
    }

    if (needsRewardDecisionReconcile(existingDecision, decision, existingClaim != null) || !existingDecision) {
      const { data: reconciled, error: reconcileError } = await admin.rpc(
        'reconcile_campaign_reward_decision',
        {
          p_run_id: run.id,
          p_player_id: profile.id,
          p_eligible: decision.eligible,
          p_tier_id: decision.eligible ? decision.tierId : null,
          p_amount_cents: decision.amountCents,
          p_total_stars: decision.totalStars,
          p_total_score: decision.totalScore,
          p_decision: decision,
        },
      )

      if (reconcileError) {
        // Migration not applied yet — fall back to insert-only for brand-new runs.
        if (!existingDecision) {
          const { data: inserted, error: insertError } = await admin
            .from('promotional_campaign_reward_decisions')
            .insert({
              run_id: run.id,
              player_id: profile.id,
              eligible: decision.eligible,
              tier_id: decision.eligible ? decision.tierId : null,
              amount_cents: decision.amountCents,
              currency: 'AUD',
              total_stars: decision.totalStars,
              total_score: decision.totalScore,
              decision,
              voucher_issued: false,
            })
            .select('*')
            .single()
          if (insertError) {
            console.error('evaluate-campaign-run insert failed', insertError.message)
            return publicError(500, 'server_error', 'Could not persist reward decision.')
          }
          await admin
            .from('promotional_campaign_runs')
            .update({
              status: decision.eligible ? 'reward_calculated' : 'ineligible',
              reward_tier_id: decision.eligible ? decision.tierId : null,
              reward_amount_cents: decision.amountCents,
              reward_eligible: decision.eligible,
              reward_reason: decision.reason,
              total_stars: decision.totalStars,
              total_score: decision.totalScore,
              decision,
              completed_at: new Date().toISOString(),
            })
            .eq('id', run.id)

          return jsonResponse({
            ok: true,
            idempotent: false,
            voucherIssued: false,
            decision,
            eligible: decision.eligible,
            tierId: decision.eligible ? decision.tierId : null,
            amountCents: decision.amountCents,
            totalStars: decision.totalStars,
            totalScore: decision.totalScore,
            nickname: profile.public_nickname,
            levelsExpected: CAMPAIGN_LEVEL_IDS.length,
            levelsVerified: (levels ?? []).filter((row) => row.status === 'verified').length,
            decisionId: inserted?.id ?? null,
            reconcileFallback: 'insert_only',
          })
        }

        console.error('reconcile_campaign_reward_decision failed', reconcileError.message)
        return publicError(
          500,
          'server_error',
          'Could not reconcile reward decision. Apply reward-decision reconcile migration.',
        )
      }

      const payload = (reconciled ?? {}) as Record<string, unknown>
      if (payload.ok !== true) {
        return publicError(
          400,
          typeof payload.code === 'string' ? payload.code : 'reconcile_failed',
          typeof payload.message === 'string'
            ? payload.message
            : 'Could not reconcile reward decision.',
        )
      }

      return jsonResponse({
        ok: true,
        idempotent: payload.idempotent === true,
        reconciled: payload.reconciled === true,
        voucherIssued: false,
        decision: payload.decision ?? decision,
        eligible: payload.eligible === true,
        tierId: typeof payload.tierId === 'string' ? payload.tierId : null,
        amountCents: Number(payload.amountCents ?? 0),
        totalStars: Number(payload.totalStars ?? 0),
        totalScore: Number(payload.totalScore ?? 0),
        nickname: profile.public_nickname,
        levelsExpected: CAMPAIGN_LEVEL_IDS.length,
        levelsVerified: (levels ?? []).filter((row) => row.status === 'verified').length,
        decisionId: payload.decisionId ?? null,
      })
    }

    return publicError(500, 'server_error', 'Could not evaluate campaign run.')
  } catch (error) {
    console.error('evaluate-campaign-run failed', error)
    return publicError(500, 'server_error', 'Could not evaluate campaign run.')
  }
})
