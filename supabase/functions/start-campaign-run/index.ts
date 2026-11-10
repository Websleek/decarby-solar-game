import { CAMPAIGN_LEVEL_IDS } from '../_shared/achievements/registry.ts'
import {
  PROMOTIONAL_CAMPAIGN_ID,
  PROMOTIONAL_CAMPAIGN_VERSION,
} from '../_shared/campaign/rewardTiers.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

/**
 * Starts a new promotional Classic campaign run for the authenticated player.
 * Does not issue vouchers. Requires Final A migration.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return publicError(401, 'unauthenticated', 'Sign in to start a campaign run.')

    const userClient = createUserClient(authHeader)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return publicError(401, 'unauthenticated', 'Sign in to start a campaign run.')
    }

    const admin = createServiceClient()
    const { data: profile } = await admin
      .from('player_profiles')
      .select('id, moderation_status, public_nickname')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile || profile.moderation_status !== 'active') {
      return publicError(403, 'profile_required', 'Create an online nickname first.')
    }

    const { data: run, error: runError } = await admin
      .from('promotional_campaign_runs')
      .insert({
        player_id: profile.id,
        campaign_id: PROMOTIONAL_CAMPAIGN_ID,
        campaign_version: PROMOTIONAL_CAMPAIGN_VERSION,
        status: 'in_progress',
      })
      .select('id, created_at')
      .single()

    if (runError || !run) {
      console.error('start-campaign-run insert failed', runError?.message)
      return publicError(
        503,
        'campaign_unavailable',
        'Campaign runs are not available on this environment yet.',
      )
    }

    const levelRows = CAMPAIGN_LEVEL_IDS.map((levelId) => ({
      run_id: run.id,
      level_id: levelId,
      status: 'pending',
    }))
    const { error: levelsError } = await admin
      .from('promotional_campaign_run_levels')
      .insert(levelRows)
    if (levelsError) {
      console.error('start-campaign-run levels failed', levelsError.message)
      return publicError(500, 'server_error', 'Could not initialise campaign levels.')
    }

    return jsonResponse({
      ok: true,
      runId: run.id,
      campaignId: PROMOTIONAL_CAMPAIGN_ID,
      campaignVersion: PROMOTIONAL_CAMPAIGN_VERSION,
      playerId: profile.id,
      nickname: profile.public_nickname,
      createdAt: run.created_at,
      voucherIssued: false,
    })
  } catch (error) {
    console.error('start-campaign-run failed', error)
    return publicError(500, 'server_error', 'Could not start campaign run.')
  }
})
