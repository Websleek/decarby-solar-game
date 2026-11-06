import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

type Board = 'overall' | 'weekly' | 'rooftop' | 'speed' | 'status'

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30
const MAX_LIMIT = 50
const MAX_OFFSET = 500
const ALLOWED_LEVEL_IDS = new Set([
  'sunny-house',
  'chimney-challenge',
  'tricky-rooftop',
  'solar-puzzle-master',
  'decarby-solar-champion',
])

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function clientKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'anonymous'
  )
}

function takeRateToken(key: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (bucket.count >= RATE_MAX) return false
  bucket.count += 1
  return true
}

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 20
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT)
}

function clampOffset(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(Math.trunc(n), 0), MAX_OFFSET)
}

function mapOverall(rows: unknown[]) {
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      rank: Number(r.rank),
      publicNickname: String(r.public_nickname),
      totalScore: Number(r.total_score),
      levelsCompleted: Number(r.levels_completed),
      totalDurationMs: Number(r.total_duration_ms),
    }
  })
}

function mapWeekly(rows: unknown[]) {
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      rank: Number(r.rank),
      publicNickname: String(r.public_nickname),
      totalScore: Number(r.total_score),
      levelsCounted: Number(r.levels_counted),
      weekLabel: String(r.week_label),
      weekEnd: String(r.week_end),
    }
  })
}

function mapRooftop(rows: unknown[]) {
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      rank: Number(r.rank),
      publicNickname: String(r.public_nickname),
      verifiedScore: Number(r.verified_score),
      verifiedDurationMs: Number(r.verified_duration_ms),
      levelId: String(r.level_id),
      puzzleVersion: Number(r.puzzle_version),
    }
  })
}

function mapSpeed(rows: unknown[]) {
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      rank: Number(r.rank),
      publicNickname: String(r.public_nickname),
      verifiedDurationMs: Number(r.verified_duration_ms),
      verifiedScore: Number(r.verified_score),
      levelId: String(r.level_id),
      puzzleVersion: Number(r.puzzle_version),
    }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  if (!takeRateToken(clientKey(req))) {
    return publicError(429, 'rate_limited', 'Too many leaderboard requests. Try again shortly.')
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return publicError(400, 'invalid_request', 'Invalid request body.')
    }

    const board = (body as { board?: unknown }).board
    if (
      board !== 'overall' &&
      board !== 'weekly' &&
      board !== 'rooftop' &&
      board !== 'speed' &&
      board !== 'status'
    ) {
      return publicError(
        400,
        'invalid_request',
        'board must be overall, weekly, rooftop, speed, or status.',
      )
    }

    const limit = clampLimit((body as { limit?: unknown }).limit)
    const offset = clampOffset((body as { offset?: unknown }).offset)
    const levelId = (body as { levelId?: unknown }).levelId

    if (board === 'rooftop' || board === 'speed') {
      if (typeof levelId !== 'string' || !ALLOWED_LEVEL_IDS.has(levelId)) {
        return publicError(400, 'invalid_request', 'A valid levelId is required for this board.')
      }
    }

    // Auth is optional: public nickname rankings are readable without a profile.
    // When Authorization is present, resolve the caller's public nickname only.
    const authHeader = req.headers.get('Authorization')
    const admin = createServiceClient()
    const userClient = authHeader ? createUserClient(authHeader) : null

    const [{ data: speedAvailable }, { data: weekRows }, nicknameResult] = await Promise.all([
      admin.rpc('leaderboard_speed_available'),
      admin.rpc('competition_week_bounds_canberra'),
      userClient
        ? userClient.rpc('leaderboard_my_nickname')
        : Promise.resolve({ data: null as string | null, error: null }),
    ])

    const weekRow = Array.isArray(weekRows) ? weekRows[0] : weekRows
    const week =
      weekRow && typeof weekRow === 'object'
        ? {
            weekStart: String((weekRow as { week_start?: string }).week_start ?? ''),
            weekEnd: String((weekRow as { week_end?: string }).week_end ?? ''),
            label: String((weekRow as { label?: string }).label ?? ''),
          }
        : null

    const myNickname =
      typeof nicknameResult.data === 'string' && nicknameResult.data.length > 0
        ? nicknameResult.data
        : null

    if (board === 'status') {
      return jsonResponse({
        ok: true,
        board: 'status',
        entries: [],
        myNickname,
        speedAvailable: Boolean(speedAvailable),
        week,
      })
    }

    if (board === 'speed' && !speedAvailable) {
      return publicError(
        403,
        'speed_unavailable',
        'Speed Champions unlock after the first verified Time Attack result.',
      )
    }

    let entries: unknown[] = []
    const typedBoard = board as Exclude<Board, 'status'>

    if (typedBoard === 'overall') {
      const { data, error } = await admin.rpc('leaderboard_overall', {
        p_limit: limit,
        p_offset: offset,
      })
      if (error) return publicError(500, 'query_failed', 'Could not load Overall Champions.')
      entries = mapOverall((data ?? []) as unknown[])
    } else if (typedBoard === 'weekly') {
      const { data, error } = await admin.rpc('leaderboard_weekly', {
        p_limit: limit,
        p_offset: offset,
      })
      if (error) return publicError(500, 'query_failed', 'Could not load Weekly Leaders.')
      entries = mapWeekly((data ?? []) as unknown[])
    } else if (typedBoard === 'rooftop') {
      const { data, error } = await admin.rpc('leaderboard_rooftop', {
        p_level_id: levelId,
        p_limit: limit,
        p_offset: offset,
      })
      if (error) return publicError(500, 'query_failed', 'Could not load Rooftop Rankings.')
      entries = mapRooftop((data ?? []) as unknown[])
    } else {
      const { data, error } = await admin.rpc('leaderboard_speed', {
        p_level_id: levelId,
        p_limit: limit,
        p_offset: offset,
      })
      if (error) return publicError(500, 'query_failed', 'Could not load Speed Champions.')
      entries = mapSpeed((data ?? []) as unknown[])
    }

    // Response contains only public nicknames and ranking values — never auth IDs.
    return jsonResponse({
      ok: true,
      board: typedBoard,
      entries,
      myNickname,
      speedAvailable: Boolean(speedAvailable),
      week,
    })
  } catch (error) {
    console.error('get-leaderboard failed', error)
    return publicError(500, 'server_error', 'Leaderboard request failed.')
  }
})
