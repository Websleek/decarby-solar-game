import { isStaffOperator, requireAuthenticatedUser } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { clientKey, takeRateToken } from '../_shared/rateLimit.ts'

/**
 * Staff/admin-triggered finalisation of an immutable leaderboard snapshot.
 * Uses service_role RPC only after DB-backed operator check.
 * Does not rewrite live leaderboard scoring.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  if (!takeRateToken(`finalise-snapshot:${clientKey(req)}`, { max: 10 })) {
    return publicError(429, 'rate_limited', 'Too many snapshot requests. Try again shortly.')
  }

  try {
    const auth = await requireAuthenticatedUser(req)
    if ('error' in auth) {
      return publicError(401, 'unauthenticated', 'Sign in required.')
    }

    const staff = await isStaffOperator(auth.admin, auth.user.id)
    if (!staff) {
      return publicError(403, 'operator_required', 'Authorised staff operator role required.')
    }

    const body = (await req.json().catch(() => null)) as {
      board?: unknown
      periodLabel?: unknown
      sourceFingerprint?: unknown
      levelId?: unknown
      periodStart?: unknown
      periodEnd?: unknown
      limit?: unknown
    } | null

    if (!body || typeof body !== 'object') {
      return publicError(400, 'invalid_request', 'Invalid request body.')
    }

    const board = body.board
    if (board !== 'overall' && board !== 'speed') {
      return publicError(400, 'invalid_request', 'board must be overall or speed.')
    }
    if (typeof body.periodLabel !== 'string' || body.periodLabel.trim().length < 3) {
      return publicError(400, 'invalid_request', 'periodLabel is required.')
    }
    if (typeof body.sourceFingerprint !== 'string' || body.sourceFingerprint.length < 8) {
      return publicError(400, 'invalid_request', 'sourceFingerprint is required.')
    }
    if (board === 'speed' && (typeof body.levelId !== 'string' || body.levelId.length < 3)) {
      return publicError(400, 'invalid_request', 'levelId is required for speed snapshots.')
    }

    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.min(Math.max(Math.trunc(body.limit), 1), 200)
        : 100

    const { data, error } = await auth.admin.rpc('finalise_leaderboard_snapshot', {
      p_board: board,
      p_period_label: body.periodLabel.trim(),
      p_source_fingerprint: body.sourceFingerprint,
      p_level_id: board === 'speed' ? body.levelId : null,
      p_period_start: typeof body.periodStart === 'string' ? body.periodStart : null,
      p_period_end: typeof body.periodEnd === 'string' ? body.periodEnd : null,
      p_limit: limit,
    })
    if (error) {
      console.error('finalise_leaderboard_snapshot failed', error)
      return publicError(500, 'finalise_failed', 'Could not finalise leaderboard snapshot.')
    }

    const row = Array.isArray(data) ? data[0] : data
    const r = (row ?? {}) as Record<string, unknown>
    return jsonResponse({
      ok: true,
      snapshotId: r.snapshot_id == null ? null : String(r.snapshot_id),
      inserted: Boolean(r.inserted),
      entryCount: Number(r.entry_count ?? 0),
      finalised: true,
    })
  } catch (error) {
    console.error('finalise-leaderboard-snapshot failed', error)
    return publicError(500, 'server_error', 'Snapshot finalisation failed.')
  }
})
