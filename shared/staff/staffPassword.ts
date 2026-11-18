/**
 * Shared staff password verifier (scrypt).
 * Format: scrypt$N$r$p$saltB64$hashB64
 * Never store or ship plaintext passwords in frontend env vars.
 */

import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto'

const PREFIX = 'scrypt'

export function hashStaffPassword(
  password: string,
  options?: { N?: number; r?: number; p?: number; saltBytes?: number },
): string {
  const N = options?.N ?? 16384
  const r = options?.r ?? 8
  const p = options?.p ?? 1
  const salt = randomBytes(options?.saltBytes ?? 16)
  const hash = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 })
  return [
    PREFIX,
    String(N),
    String(r),
    String(p),
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$')
}

export function verifyStaffPassword(password: string, encoded: string): boolean {
  try {
    const parts = encoded.split('$')
    if (parts.length !== 6 || parts[0] !== PREFIX) return false
    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4]!, 'base64url')
    const expected = Buffer.from(parts[5]!, 'base64url')
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
    if (salt.length < 8 || expected.length < 16) return false
    const actual = scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    })
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
