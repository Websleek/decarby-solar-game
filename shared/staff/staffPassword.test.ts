import { describe, expect, it } from 'vitest'
import {
  hashStaffPassword,
  inspectStaffPasswordHash,
  normalizeStaffPasswordHashEnv,
  verifyStaffPassword,
  verifyStaffPasswordDetailed,
} from './staffPassword'
import {
  clearStaffSessionCookieHeader,
  createStaffSessionToken,
  readCookie,
  STAFF_SESSION_COOKIE,
  staffSessionCookieHeader,
  verifyStaffSessionToken,
} from './staffSession'
import {
  LOGIN_MAX_ATTEMPTS,
  assertLoginAllowed,
  hashIpBucket,
  recordLoginFailure,
} from '../../api/_lib/rateLimit'

describe('staff password hash format', () => {
  it('generator emits env-safe colon format (no $)', () => {
    const encoded = hashStaffPassword('Disposable-Test-Pass-2026!')
    expect(encoded.startsWith('scrypt:')).toBe(true)
    expect(encoded.includes('$')).toBe(false)
    expect(encoded.split(':')).toHaveLength(6)
    expect(inspectStaffPasswordHash(encoded)).toMatchObject({ ok: true, format: 'canonical' })
  })

  it('verifies the generated hash for the correct password', () => {
    const password = 'Disposable-Test-Pass-2026!'
    const encoded = hashStaffPassword(password)
    expect(verifyStaffPassword(password, encoded)).toBe(true)
    expect(verifyStaffPasswordDetailed(password, encoded)).toEqual({ ok: true })
  })

  it('rejects incorrect passwords', () => {
    const encoded = hashStaffPassword('Disposable-Test-Pass-2026!')
    expect(verifyStaffPassword('wrong-password', encoded)).toBe(false)
    expect(verifyStaffPasswordDetailed('wrong-password', encoded)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('supports passwords with spaces and special characters', () => {
    const password = 'Sea shell $ale 99! @#%'
    const encoded = hashStaffPassword(password)
    expect(verifyStaffPassword(password, encoded)).toBe(true)
    expect(verifyStaffPassword('Sea shell $ale 99! @#', encoded)).toBe(false)
  })

  it('still verifies intact legacy $ hashes', () => {
    // Build a legacy hash with the same scrypt params for compatibility.
    const password = 'Legacy-Compat-Pass!'
    const canonical = hashStaffPassword(password)
    const legacy = canonical.replaceAll(':', '$')
    expect(inspectStaffPasswordHash(legacy)).toMatchObject({ ok: true, format: 'legacy' })
    expect(verifyStaffPassword(password, legacy)).toBe(true)
  })

  it('detects malformed hashes instead of treating them as wrong passwords', () => {
    expect(inspectStaffPasswordHash('')).toEqual({ ok: false, reason: 'missing' })
    expect(inspectStaffPasswordHash('not-a-hash')).toEqual({ ok: false, reason: 'malformed' })
    expect(inspectStaffPasswordHash('scrypt$1$2')).toEqual({ ok: false, reason: 'malformed' })
    expect(
      verifyStaffPasswordDetailed('x', 'scrypt:16384:8:1:abc:def\nSet Vercel env'),
    ).toEqual({ ok: false, reason: 'malformed' })
  })

  it('normalizes multiline and quoted env pastes', () => {
    const encoded = hashStaffPassword('Disposable-Test-Pass-2026!')
    const multiline = `${encoded}\n\nSet Vercel env STAFF_PASSWORD_HASH to the value above.`
    expect(normalizeStaffPasswordHashEnv(multiline)).toBe(encoded)
    expect(normalizeStaffPasswordHashEnv(`"${encoded}"`)).toBe(encoded)
    expect(normalizeStaffPasswordHashEnv(`'${encoded}'`)).toBe(encoded)
    expect(verifyStaffPassword('Disposable-Test-Pass-2026!', multiline)).toBe(true)
  })

  it('shows why $ env expansion breaks legacy hashes', () => {
    const password = 'Disposable-Test-Pass-2026!'
    // Deterministic legacy hash whose salt/hash segments start with letters.
    const legacy =
      'scrypt$16384$8$1$QWJjZGVmZ2hpamtsbW5vcA$YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM'
    const expanded = legacy.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, '')
    expect(legacy.split('$')).toHaveLength(6)
    expect(expanded.split('$').length).toBeLessThan(6)
    expect(inspectStaffPasswordHash(expanded).ok).toBe(false)
    expect(verifyStaffPasswordDetailed(password, expanded).ok).toBe(false)
    expect(verifyStaffPasswordDetailed(password, expanded)).toMatchObject({
      reason: 'malformed',
    })
  })
})

describe('staff session cookies', () => {
  it('issues and verifies short-lived signed sessions', () => {
    const secret = 's'.repeat(32)
    const { token, payload } = createStaffSessionToken(secret, 1_700_000_000, 120)
    expect(verifyStaffSessionToken(token, secret, 1_700_000_010)?.jti).toBe(payload.jti)
    expect(verifyStaffSessionToken(token, secret, 1_700_000_200)).toBeNull()
    expect(verifyStaffSessionToken('tampered.' + token, secret, 1_700_000_010)).toBeNull()
  })

  it('builds HttpOnly SameSite cookies and clears them', () => {
    const set = staffSessionCookieHeader('abc.def', { maxAgeSeconds: 60, secure: true })
    expect(set).toContain(`${STAFF_SESSION_COOKIE}=abc.def`)
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Strict')
    expect(set).toContain('Secure')
    expect(clearStaffSessionCookieHeader(true)).toContain('Max-Age=0')
    expect(readCookie(`${STAFF_SESSION_COOKIE}=tok`, STAFF_SESSION_COOKIE)).toBe('tok')
  })
})

describe('staff login rate limit', () => {
  it('locks after too many failures and reports retry-after', async () => {
    const store = new Map<string, Record<string, unknown>>()
    const admin = {
      from() {
        return {
          select() {
            return {
              eq(_col: string, key: string) {
                return {
                  maybeSingle: async () => ({ data: store.get(key) ?? null }),
                }
              },
            }
          },
          upsert: async (row: Record<string, unknown>) => {
            store.set(String(row.bucket_key), row)
            return { data: row, error: null }
          },
          delete() {
            return {
              eq: async (_col: string, key: string) => {
                store.delete(key)
                return { error: null }
              },
            }
          },
        }
      },
    }

    const ip = '203.0.113.50'
    const now = new Date('2026-11-19T00:00:00.000Z')
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i += 1) {
      await recordLoginFailure(admin as never, ip, now)
    }
    const limited = await assertLoginAllowed(admin as never, ip, now)
    expect(limited.ok).toBe(false)
    if (!limited.ok) {
      expect(limited.retryAfterSeconds).toBeGreaterThan(0)
    }
    expect(store.has(hashIpBucket(ip))).toBe(true)
  })
})
