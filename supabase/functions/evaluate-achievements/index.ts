import { awardAchievementsForPlayer } from '../_shared/achievements/server.ts'
import { listAchievements } from '../_shared/achievements/registry.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return publicError(401, 'unauthenticated', 'Sign in to evaluate achievements.')

    const body = (await req.json().catch(() => ({}))) as { mode?: unknown }
    const mode = body.mode === 'backfill' ? 'backfill' : 'sync'

    const userClient = createUserClient(authHeader)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return publicError(401, 'unauthenticated', 'Sign in to evaluate achievements.')
    }

    const admin = createServiceClient()
    const { data: profile } = await admin
      .from('player_profiles')
      .select('id, moderation_status, public_nickname')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile || profile.moderation_status !== 'active') {
      return publicError(403, 'profile_required', 'Online profile required.')
    }

    // Backfill never invents telemetry: perfect_fit stays locked until
    // verified_invalid_placements is populated by a post-telemetry verify.
    const awardResult = await awardAchievementsForPlayer(admin, {
      playerId: profile.id,
      publicNickname: profile.public_nickname ?? null,
      sourceAttemptId: null,
      sourceRecordId: null,
    })

    const { data: earnedRows } = await admin
      .from('player_achievements')
      .select('achievement_id, earned_at, source_attempt_id, source_record_id')
      .eq('player_id', profile.id)
      .order('earned_at', { ascending: true })

    return jsonResponse({
      ok: true,
      mode,
      catalog: listAchievements(),
      earned: Array.isArray(earnedRows) ? earnedRows : [],
      newlyEarnedAchievements: awardResult.newlyEarned,
      awards: awardResult.awards,
    })
  } catch (error) {
    console.error('evaluate-achievements failed', error)
    return publicError(500, 'server_error', 'Could not evaluate achievements.')
  }
})
