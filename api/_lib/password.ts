/**
 * Serverless-local staff password helpers (CommonJS-friendly for Vercel).
 * Canonical format: scrypt:N:r:p:saltB64url:hashB64url
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const PREFIX = 'scrypt'
const CANONICAL_SEP = ':'
const LEGACY_SEP = '$'

export type StaffPasswordHashInspection =
  | { ok: true; format: 'canonical' | 'legacy'; N: number; r: number; p: number }
  | { ok: false; reason: 'missing' | 'malformed' }

export type StaffPasswordVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'mismatch' | 'malformed' | 'missing' }

function parseEncodedHash(encoded: string): {
  format: 'canonical' | 'legacy'
  N: number
  r: number
  p: number
  salt: Buffer
  expected: Buffer
} | null {
  const trimmed = normalizeStaffPasswordHashEnv(encoded)
  if (!trimmed) return null

  let format: 'canonical' | 'legacy' | null = null
  let parts: string[] = []
  if (trimmed.startsWith(`${PREFIX}${CANONICAL_SEP}`)) {
    parts = trimmed.split(CANONICAL_SEP)
    format = 'canonical'
  } else if (trimmed.startsWith(`${PREFIX}${LEGACY_SEP}`)) {
    parts = trimmed.split(LEGACY_SEP)
    format = 'legacy'
  } else {
    return null
  }

  if (parts.length !== 6 || parts[0] !== PREFIX || !format) return null
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return null
  if (N < 2 || r < 1 || p < 1) return null

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4]!, 'base64url')
    expected = Buffer.from(parts[5]!, 'base64url')
  } catch {
    return null
  }
  if (!/^[A-Za-z0-9_-]+$/.test(parts[4]!) || !/^[A-Za-z0-9_-]+$/.test(parts[5]!)) {
    return null
  }
  if (salt.length < 8 || expected.length < 16) return null
  return { format, N, r, p, salt, expected }
}

export function normalizeStaffPasswordHashEnv(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return ''
  let value = raw.trim()
  if (!value) return ''
  value = value.split(/\r?\n/, 1)[0]!.trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }
  return value
}

export function inspectStaffPasswordHash(
  encoded: string | undefined | null,
): StaffPasswordHashInspection {
  const normalized = normalizeStaffPasswordHashEnv(encoded)
  if (!normalized) return { ok: false, reason: 'missing' }
  const parsed = parseEncodedHash(normalized)
  if (!parsed) return { ok: false, reason: 'malformed' }
  return { ok: true, format: parsed.format, N: parsed.N, r: parsed.r, p: parsed.p }
}

export function hashStaffPassword(
  password: string,
  options?: { N?: number; r?: number; p?: number; saltBytes?: number },
): string {
  const N = options?.N ?? 16384
  const r = options?.r ?? 8
  const p = options?.p ?? 1
  const salt = randomBytes(options?.saltBytes ?? 16)
  const hash = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 })
  return [PREFIX, String(N), String(r), String(p), salt.toString('base64url'), hash.toString('base64url')].join(
    CANONICAL_SEP,
  )
}

export function verifyStaffPasswordDetailed(
  password: string,
  encoded: string | undefined | null,
): StaffPasswordVerifyResult {
  const inspection = inspectStaffPasswordHash(encoded)
  if (!inspection.ok) return { ok: false, reason: inspection.reason }
  const parsed = parseEncodedHash(normalizeStaffPasswordHashEnv(encoded))
  if (!parsed) return { ok: false, reason: 'malformed' }
  try {
    const actual = scryptSync(password, parsed.salt, parsed.expected.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: 64 * 1024 * 1024,
    })
    if (actual.length !== parsed.expected.length) return { ok: false, reason: 'mismatch' }
    if (!timingSafeEqual(actual, parsed.expected)) return { ok: false, reason: 'mismatch' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'malformed' }
  }
}

export function verifyStaffPassword(password: string, encoded: string): boolean {
  return verifyStaffPasswordDetailed(password, encoded).ok
}
