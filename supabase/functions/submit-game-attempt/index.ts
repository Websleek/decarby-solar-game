import {
  MAX_PAYLOAD_ACTIONS_BYTES,
  MAX_VERIFIED_DURATION_MS,
  MIN_TIME_ATTACK_DURATION_MS,
  getApprovedLevel,
  sanitizeActions,
  validateReplay,
} from '../_shared/verification/index.ts'
import {
  awardAchievementsForPlayer,
  invalidPlacementCountForSubmit,
} from '../_shared/achievements/server.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return publicError(401, 'unauthenticated', 'Sign in to submit an attempt.')

    const rawText = await req.text()
    if (rawText.length > MAX_PAYLOAD_ACTIONS_BYTES + 8_192) {
      return publicError(413, 'payload_too_large', 'Submission is too large.')
    }
    const body = JSON.parse(rawText) as Record<string, unknown>
    const attemptId = body.attemptId
    const actionsRaw = body.actions
    const claimedScore = body.claimedScore
    const claimedDurationMs = body.claimedDurationMs
    const claimedCoveragePercent = body.claimedCoveragePercent
    const clientConfigurationHash = body.configurationHash

    if (typeof attemptId !== 'string') {
      return publicError(400, 'invalid_request', 'attemptId is required.')
    }

    const actions = sanitizeActions(actionsRaw)
    if (!actions) {
      return publicError(400, 'invalid_actions', 'Action log is invalid or too large.')
    }

    const userClient = createUserClient(authHeader)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return publicError(401, 'unauthenticated', 'Sign in to submit an attempt.')
    }

    const admin = createServiceClient()
    await admin.rpc('expire_stale_game_attempts')

    const { data: profile } = await admin
      .from('player_profiles')
      .select('id, moderation_status, public_nickname')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile || profile.moderation_status !== 'active') {
      return publicError(403, 'profile_required', 'Online profile required.')
    }

    // Idempotent: already finalized for this player
    const { data: existing } = await admin
      .from('game_attempts')
      .select(
        'id, status, verified_score, verified_stars, verified_coverage_percent, verified_duration_ms, rejection_code, verified_record_id',
      )
      .eq('id', attemptId)
      .eq('player_id', profile.id)
      .maybeSingle()

    if (!existing) {
      return publicError(404, 'not_found', 'Attempt not found.')
    }
    if (existing.status === 'verified') {
      let newlyEarned: string[] = []
      try {
        const awardResult = await awardAchievementsForPlayer(admin, {
          playerId: profile.id,
          publicNickname: profile.public_nickname ?? null,
          sourceAttemptId: attemptId,
          sourceRecordId: existing.verified_record_id,
        })
        newlyEarned = [...awardResult.newlyEarned]
      } catch (awardError) {
        console.error(
          'idempotent achievement award failed',
          awardError instanceof Error ? awardError.message : awardError,
        )
      }
      return jsonResponse({
        ok: true,
        status: 'verified',
        verifiedScore: existing.verified_score,
        verifiedStars: existing.verified_stars,
        verifiedCoveragePercent: existing.verified_coverage_percent,
        verifiedDurationMs: existing.verified_duration_ms,
        verifiedRecordId: existing.verified_record_id,
        newlyEarnedAchievements: newlyEarned,
        idempotent: true,
      })
    }
    if (existing.status === 'rejected') {
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: existing.rejection_code ?? 'rejected',
        message: 'This attempt was rejected.',
        idempotent: true,
      })
    }
    if (existing.status !== 'open') {
      return publicError(409, 'invalid_state', 'This attempt can no longer be submitted.')
    }

    const submittedAt = new Date()
    const { data: locked, error: lockError } = await admin
      .from('game_attempts')
      .update({
        status: 'submitted',
        submitted_at: submittedAt.toISOString(),
        claimed_score: typeof claimedScore === 'number' ? claimedScore : null,
        claimed_duration_ms: typeof claimedDurationMs === 'number' ? claimedDurationMs : null,
        claimed_coverage_percent:
          typeof claimedCoveragePercent === 'number' ? claimedCoveragePercent : null,
        actions,
        action_count: actions.length,
      })
      .eq('id', attemptId)
      .eq('player_id', profile.id)
      .eq('status', 'open')
      .select(
        'id, level_id, level_version_id, game_mode, configuration_hash, inventory_piece_ids, server_started_at, expires_at',
      )
      .maybeSingle()

    if (lockError) {
      console.error('submit lock failed', lockError.message)
      return publicError(500, 'server_error', 'Could not submit attempt.')
    }
    if (!locked) {
      return publicError(409, 'conflict', 'Attempt was already finalized.')
    }

    if (new Date(locked.expires_at).getTime() < submittedAt.getTime()) {
      await admin
        .from('game_attempts')
        .update({
          status: 'expired',
          finalized_at: submittedAt.toISOString(),
          rejection_code: 'expired',
        })
        .eq('id', attemptId)
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: 'expired',
        message: 'This attempt expired before submission.',
      })
    }

    const { data: levelVersion } = await admin
      .from('game_level_versions')
      .select('id, level_id, version, configuration_hash, active')
      .eq('id', locked.level_version_id)
      .maybeSingle()

    if (!levelVersion?.active) {
      await reject(admin, attemptId, 'inactive_version')
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: 'inactive_version',
        message: 'Level version is no longer active.',
      })
    }

    if (
      typeof clientConfigurationHash === 'string' &&
      clientConfigurationHash !== locked.configuration_hash
    ) {
      await reject(admin, attemptId, 'hash_mismatch')
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: 'hash_mismatch',
        message: 'Level configuration does not match the approved version.',
      })
    }

    if (levelVersion.configuration_hash !== locked.configuration_hash) {
      await reject(admin, attemptId, 'hash_mismatch')
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: 'hash_mismatch',
        message: 'Level configuration does not match the approved version.',
      })
    }

    const approved = getApprovedLevel(locked.level_id, levelVersion.version)
    if (!approved) {
      await reject(admin, attemptId, 'unknown_level')
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: 'unknown_level',
        message: 'Level is not approved for competition.',
      })
    }

    const pieceIds = Array.isArray(locked.inventory_piece_ids)
      ? (locked.inventory_piece_ids as string[])
      : []
    const replay = validateReplay(approved, locked.game_mode, pieceIds, actions)
    if (!replay.ok) {
      await reject(admin, attemptId, replay.code)
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: replay.code,
        message: 'Gameplay could not be verified.',
      })
    }

    // Server-observed duration boundaries (client times are untrusted).
    const serverDurationMs = Math.max(
      0,
      submittedAt.getTime() - new Date(locked.server_started_at).getTime(),
    )
    if (serverDurationMs > MAX_VERIFIED_DURATION_MS) {
      await reject(admin, attemptId, 'duration_implausible')
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: 'duration_implausible',
        message: 'Attempt duration is outside accepted bounds.',
      })
    }
    if (locked.game_mode === 'timeAttack' && serverDurationMs < MIN_TIME_ATTACK_DURATION_MS) {
      await reject(admin, attemptId, 'timing_abuse')
      return jsonResponse({
        ok: false,
        status: 'rejected',
        code: 'timing_abuse',
        message: 'Time Attack duration is implausibly short.',
      })
    }

    // Claimed score is advisory only; mismatches are logged but do not auto-reject
    // when replay succeeds (prevents spoofed claims from becoming verified values).
    if (typeof claimedScore === 'number' && claimedScore !== replay.score) {
      console.warn('claimed_score_mismatch', {
        attemptId,
        claimedScore,
        verifiedScore: replay.score,
      })
    }

    const { data: submission, error: submissionError } = await admin
      .from('game_score_submissions')
      .insert({
        player_id: profile.id,
        level_id: locked.level_id,
        level_version_id: locked.level_version_id,
        game_mode: locked.game_mode,
        claimed_score: typeof claimedScore === 'number' ? claimedScore : replay.score,
        claimed_duration_ms:
          typeof claimedDurationMs === 'number' ? claimedDurationMs : serverDurationMs,
        verification_status: 'pending',
      })
      .select('id')
      .single()

    if (submissionError || !submission) {
      console.error('submission insert failed', submissionError?.message)
      await reject(admin, attemptId, 'submission_failed')
      return publicError(500, 'server_error', 'Could not store submission.')
    }

    // Mark pending submission as verified via service role (clients cannot).
    await admin
      .from('game_score_submissions')
      .update({ verification_status: 'verified' })
      .eq('id', submission.id)

    const invalidPlacements = invalidPlacementCountForSubmit(actions, true)

    const { data: existingVerified } = await admin
      .from('verified_game_records')
      .select(
        'id, verified_score, verified_duration_ms, verified_stars, verified_invalid_placements',
      )
      .eq('player_id', profile.id)
      .eq('level_id', locked.level_id)
      .eq('level_version_id', locked.level_version_id)
      .eq('game_mode', locked.game_mode)
      .maybeSingle()

    let verifiedRecordId: string
    if (!existingVerified) {
      const { data: inserted, error: verifiedError } = await admin
        .from('verified_game_records')
        .insert({
          player_id: profile.id,
          level_id: locked.level_id,
          level_version_id: locked.level_version_id,
          game_mode: locked.game_mode,
          verified_score: replay.score,
          verified_duration_ms: serverDurationMs,
          verified_stars: replay.stars,
          verified_coverage_percent: replay.coveragePercent,
          verified_invalid_placements: invalidPlacements,
          verified_at: submittedAt.toISOString(),
        })
        .select('id')
        .single()
      if (verifiedError || !inserted) {
        console.error('verified insert failed', verifiedError?.message)
        await reject(admin, attemptId, 'verify_write_failed')
        return publicError(500, 'server_error', 'Could not store verified record.')
      }
      verifiedRecordId = inserted.id
    } else {
      verifiedRecordId = existingVerified.id
      const shouldReplace =
        locked.game_mode === 'classic'
          ? replay.score > existingVerified.verified_score
          : serverDurationMs < existingVerified.verified_duration_ms

      const nextStars =
        locked.game_mode === 'classic'
          ? Math.max(Number(existingVerified.verified_stars ?? 0), replay.stars)
          : replay.stars
      const nextInvalid =
        locked.game_mode === 'classic'
          ? existingVerified.verified_invalid_placements === null
            ? invalidPlacements
            : Math.min(Number(existingVerified.verified_invalid_placements), Number(invalidPlacements))
          : invalidPlacements

      const patch: Record<string, unknown> = {
        verified_stars: nextStars,
        verified_coverage_percent: replay.coveragePercent,
        verified_invalid_placements: nextInvalid,
      }
      if (shouldReplace) {
        patch.verified_score = replay.score
        patch.verified_duration_ms = serverDurationMs
        patch.verified_at = submittedAt.toISOString()
      }

      const { error: updateError } = await admin
        .from('verified_game_records')
        .update(patch)
        .eq('id', existingVerified.id)
      if (updateError) {
        console.error('verified update failed', updateError.message)
        await reject(admin, attemptId, 'verify_write_failed')
        return publicError(500, 'server_error', 'Could not store verified record.')
      }
    }

    await admin
      .from('game_attempts')
      .update({
        status: 'verified',
        finalized_at: submittedAt.toISOString(),
        verified_score: replay.score,
        verified_stars: replay.stars,
        verified_coverage_percent: replay.coveragePercent,
        verified_duration_ms: serverDurationMs,
        score_submission_id: submission.id,
        verified_record_id: verifiedRecordId,
        rejection_code: null,
      })
      .eq('id', attemptId)

    let newlyEarned: string[] = []
    try {
      const awardResult = await awardAchievementsForPlayer(admin, {
        playerId: profile.id,
        publicNickname: profile.public_nickname ?? null,
        sourceAttemptId: attemptId,
        sourceRecordId: verifiedRecordId,
      })
      newlyEarned = [...awardResult.newlyEarned]
    } catch (awardError) {
      console.error(
        'achievement award failed',
        awardError instanceof Error ? awardError.message : awardError,
      )
    }

    return jsonResponse({
      ok: true,
      status: 'verified',
      verifiedScore: replay.score,
      verifiedStars: replay.stars,
      verifiedCoveragePercent: replay.coveragePercent,
      verifiedDurationMs: serverDurationMs,
      verifiedRecordId: verifiedRecordId,
      newlyEarnedAchievements: newlyEarned,
      idempotent: false,
    })
  } catch (error) {
    console.error('submit-game-attempt failure', error instanceof Error ? error.message : error)
    return publicError(500, 'server_error', 'Could not submit attempt.')
  }
})

async function reject(
  admin: ReturnType<typeof createServiceClient>,
  attemptId: string,
  code: string,
): Promise<void> {
  await admin
    .from('game_attempts')
    .update({
      status: 'rejected',
      finalized_at: new Date().toISOString(),
      rejection_code: code,
    })
    .eq('id', attemptId)
}
