import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_MAX_ATTEMPTS = 8
export const LOGIN_LOCK_MS = 15 * 60 * 1000

export function hashIpBucket(ip: string): string {
  return createHash('sha256').update(`staff-login:${ip}`).digest('hex')
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number }

export async function assertLoginAllowed(
  admin: SupabaseClient,
  ip: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const key = hashIpBucket(ip)
  const { data: row } = await admin
    .from('staff_password_attempt_buckets')
    .select('bucket_key, window_started_at, attempt_count, locked_until')
    .eq('bucket_key', key)
    .maybeSingle()

  if (row?.locked_until) {
    const lockedUntil = new Date(row.locked_until).getTime()
    if (lockedUntil > now.getTime()) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - now.getTime()) / 1000)),
      }
    }
  }

  const windowStarted = row?.window_started_at ? new Date(row.window_started_at).getTime() : 0
  const inWindow = windowStarted > 0 && now.getTime() - windowStarted < LOGIN_WINDOW_MS
  const attempts = inWindow ? Number(row?.attempt_count ?? 0) : 0
  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MS).toISOString()
    await admin.from('staff_password_attempt_buckets').upsert(
      {
        bucket_key: key,
        window_started_at: row?.window_started_at ?? now.toISOString(),
        attempt_count: attempts,
        locked_until: lockedUntil,
        updated_at: now.toISOString(),
      },
      { onConflict: 'bucket_key' },
    )
    return { ok: false, retryAfterSeconds: Math.ceil(LOGIN_LOCK_MS / 1000) }
  }

  return { ok: true, remaining: LOGIN_MAX_ATTEMPTS - attempts }
}

export async function recordLoginFailure(
  admin: SupabaseClient,
  ip: string,
  now: Date = new Date(),
): Promise<void> {
  const key = hashIpBucket(ip)
  const { data: row } = await admin
    .from('staff_password_attempt_buckets')
    .select('window_started_at, attempt_count, locked_until')
    .eq('bucket_key', key)
    .maybeSingle()

  const windowStarted = row?.window_started_at ? new Date(row.window_started_at).getTime() : 0
  const inWindow = windowStarted > 0 && now.getTime() - windowStarted < LOGIN_WINDOW_MS
  const nextCount = (inWindow ? Number(row?.attempt_count ?? 0) : 0) + 1
  const lockedUntil =
    nextCount >= LOGIN_MAX_ATTEMPTS
      ? new Date(now.getTime() + LOGIN_LOCK_MS).toISOString()
      : null

  await admin.from('staff_password_attempt_buckets').upsert(
    {
      bucket_key: key,
      window_started_at: inWindow && row?.window_started_at ? row.window_started_at : now.toISOString(),
      attempt_count: nextCount,
      locked_until: lockedUntil,
      updated_at: now.toISOString(),
    },
    { onConflict: 'bucket_key' },
  )
}

export async function clearLoginFailures(
  admin: SupabaseClient,
  ip: string,
): Promise<void> {
  const key = hashIpBucket(ip)
  await admin.from('staff_password_attempt_buckets').delete().eq('bucket_key', key)
}
