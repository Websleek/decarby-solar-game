import { CAMPAIGN_LEVEL_IDS } from '../_shared/achievements/registry.ts'
import { evaluateCampaignReward } from '../_shared/campaign/rewardTiers.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

/**
 * Idempotent campaign reward evaluation from verified run-associated Classic results.
 * Never issues voucher codes.
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

    const { data: existingDecision } = await admin
      .from('promotional_campaign_reward_decisions')
      .select('*')
      .eq('run_id', body.runId)
      .maybeSingle()
    if (existingDecision) {
      if (existingDecision.player_id !== profile.id) {
        return publicError(403, 'forbidden', 'Campaign run does not belong to this player.')
      }
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
      })
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

    const verified = (levels ?? []).filter((row) => row.status === 'verified')
    const facts = verified.map((row) => ({
      levelId: row.level_id,
      verifiedStars: Number(row.verified_stars ?? 0),
      verifiedScore: Number(row.verified_score ?? 0),
      verifiedRecordId: String(row.verified_record_id ?? ''),
      levelVersion: Number(row.level_version ?? 1),
    }))

    const decision = evaluateCampaignReward(facts as never)

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
      // Unique conflict → re-read
      const { data: raced } = await admin
        .from('promotional_campaign_reward_decisions')
        .select('*')
        .eq('run_id', body.runId)
        .maybeSingle()
      if (raced) {
        return jsonResponse({
          ok: true,
          idempotent: true,
          voucherIssued: false,
          decision: raced.decision,
          eligible: raced.eligible,
          tierId: raced.tier_id,
          amountCents: raced.amount_cents,
          totalStars: raced.total_stars,
          totalScore: raced.total_score,
          nickname: profile.public_nickname,
        })
      }
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
      levelsVerified: verified.length,
      decisionId: inserted?.id ?? null,
    })
  } catch (error) {
    console.error('evaluate-campaign-run failed', error)
    return publicError(500, 'server_error', 'Could not evaluate campaign run.')
  }
})
