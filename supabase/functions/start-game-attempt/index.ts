import {
  ATTEMPT_TTL_MS,
  MAX_ATTEMPTS_PER_HOUR,
  MAX_OPEN_ATTEMPTS_PER_PLAYER,
  approvedHashFor,
  buildInventoryPieceIds,
  getApprovedLevel,
} from '../_shared/verification/index.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return publicError(401, 'unauthenticated', 'Sign in to start an online attempt.')

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return publicError(400, 'invalid_request', 'Invalid request body.')
    }

    const levelId = (body as { levelId?: unknown }).levelId
    const gameMode = (body as { gameMode?: unknown }).gameMode
    const clientNonce = (body as { clientNonce?: unknown }).clientNonce
    const campaignRunId = (body as { campaignRunId?: unknown }).campaignRunId
    if (typeof levelId !== 'string' || (gameMode !== 'classic' && gameMode !== 'timeAttack')) {
      return publicError(400, 'invalid_request', 'levelId and gameMode are required.')
    }
    if (clientNonce !== undefined && (typeof clientNonce !== 'string' || clientNonce.length > 64)) {
      return publicError(400, 'invalid_request', 'Invalid client nonce.')
    }
    if (
      campaignRunId !== undefined &&
      campaignRunId !== null &&
      (typeof campaignRunId !== 'string' || campaignRunId.length < 8)
    ) {
      return publicError(400, 'invalid_request', 'Invalid campaignRunId.')
    }

    const userClient = createUserClient(authHeader)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return publicError(401, 'unauthenticated', 'Sign in to start an online attempt.')
    }

    const admin = createServiceClient()
    await admin.rpc('expire_stale_game_attempts')

    const { data: profile, error: profileError } = await admin
      .from('player_profiles')
      .select('id, moderation_status, public_nickname')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError || !profile) {
      return publicError(403, 'profile_required', 'Create an online nickname before submitting.')
    }
    if (profile.moderation_status !== 'active') {
      return publicError(403, 'profile_restricted', 'This profile cannot enter competitive play.')
    }

    const { data: levelVersion, error: versionError } = await admin
      .from('game_level_versions')
      .select('id, level_id, version, configuration_hash, active')
      .eq('level_id', levelId)
      .eq('active', true)
      .maybeSingle()
    if (versionError || !levelVersion) {
      return publicError(404, 'level_unavailable', 'No active competitive version for that rooftop.')
    }

    const approved = getApprovedLevel(levelId, levelVersion.version)
    const expectedHash = approvedHashFor(levelId, levelVersion.version)
    if (!approved || !expectedHash || expectedHash !== levelVersion.configuration_hash) {
      return publicError(409, 'version_mismatch', 'Level configuration is not approved for competition.')
    }

    if (gameMode === 'timeAttack') {
      const { data: classicRecord } = await admin
        .from('verified_game_records')
        .select('id')
        .eq('player_id', profile.id)
        .eq('level_id', levelId)
        .eq('game_mode', 'classic')
        .limit(1)
        .maybeSingle()
      if (!classicRecord) {
        return publicError(
          403,
          'mode_locked',
          'Verify a Classic completion online before Time Attack.',
        )
      }
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await admin
      .from('game_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', profile.id)
      .gte('server_started_at', hourAgo)
    if ((recentCount ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
      return publicError(429, 'rate_limited', 'Too many attempts. Try again later.')
    }

    const { count: openCount } = await admin
      .from('game_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', profile.id)
      .eq('status', 'open')
    if ((openCount ?? 0) >= MAX_OPEN_ATTEMPTS_PER_PLAYER) {
      await admin
        .from('game_attempts')
        .update({
          status: 'abandoned',
          finalized_at: new Date().toISOString(),
          rejection_code: 'superseded',
        })
        .eq('player_id', profile.id)
        .eq('status', 'open')
    }

    if (typeof clientNonce === 'string') {
      const { data: existing } = await admin
        .from('game_attempts')
        .select('id, status, expires_at, inventory_piece_ids, level_version_id, configuration_hash')
        .eq('player_id', profile.id)
        .eq('client_nonce', clientNonce)
        .maybeSingle()
      if (existing?.status === 'open') {
        return jsonResponse({
          ok: true,
          attemptId: existing.id,
          levelVersionId: existing.level_version_id,
          configurationHash: existing.configuration_hash,
          inventoryPieceIds: existing.inventory_piece_ids,
          expiresAt: existing.expires_at,
          idempotent: true,
        })
      }
    }

    let resolvedCampaignRunId: string | null = null
    if (typeof campaignRunId === 'string') {
      const { data: run } = await admin
        .from('promotional_campaign_runs')
        .select('id, player_id, status')
        .eq('id', campaignRunId)
        .maybeSingle()
      if (!run || run.player_id !== profile.id) {
        return publicError(403, 'campaign_run_forbidden', 'Campaign run not found for this player.')
      }
      if (run.status !== 'in_progress' && run.status !== 'awaiting_verification') {
        return publicError(409, 'campaign_run_closed', 'This campaign run is no longer accepting levels.')
      }
      if (gameMode !== 'classic') {
        return publicError(400, 'invalid_request', 'Promotional campaign runs require Classic mode.')
      }
      resolvedCampaignRunId = run.id
    }

    const inventoryPieceIds = buildInventoryPieceIds(approved)
    const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString()
    const { data: attempt, error: insertError } = await admin
      .from('game_attempts')
      .insert({
        player_id: profile.id,
        level_id: levelId,
        level_version_id: levelVersion.id,
        game_mode: gameMode,
        status: 'open',
        configuration_hash: expectedHash,
        inventory_piece_ids: inventoryPieceIds,
        expires_at: expiresAt,
        client_nonce: typeof clientNonce === 'string' ? clientNonce : null,
        campaign_run_id: resolvedCampaignRunId,
      })
      .select('id, expires_at, inventory_piece_ids, level_version_id, configuration_hash, campaign_run_id')
      .single()

    if (insertError || !attempt) {
      console.error('start-game-attempt insert failed', insertError?.message)
      return publicError(500, 'server_error', 'Could not start attempt.')
    }

    return jsonResponse({
      ok: true,
      attemptId: attempt.id,
      levelVersionId: attempt.level_version_id,
      configurationHash: attempt.configuration_hash,
      inventoryPieceIds: attempt.inventory_piece_ids,
      expiresAt: attempt.expires_at,
      campaignRunId: attempt.campaign_run_id ?? null,
      idempotent: false,
    })
  } catch (error) {
    console.error('start-game-attempt failure', error instanceof Error ? error.message : error)
    return publicError(500, 'server_error', 'Could not start attempt.')
  }
})
