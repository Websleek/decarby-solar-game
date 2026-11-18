import { describe, expect, it } from 'vitest'
import { redeemedMessageCanberra, formatCanberraDateTime } from './canberraTime'
import { normalizeVoucherCode } from './normalizeVoucherCode'
import {
  canOfferRedeem,
  deriveDisplayStatus,
  isLiveIssuanceGate,
} from './redeemEligibility'
import { hashStaffPassword, verifyStaffPassword } from './staffPassword'
import {
  createStaffSessionToken,
  verifyStaffSessionToken,
  staffSessionCookieHeader,
  clearStaffSessionCookieHeader,
  readCookie,
  STAFF_SESSION_COOKIE,
} from './staffSession'

const LIVE_GATE = {
  mode: 'approved_live',
  claimsEnabled: true,
  realRedeemable: true,
} as const

const DEMO_GATE = {
  mode: 'demo',
  claimsEnabled: true,
  realRedeemable: false,
} as const

describe('normalizeVoucherCode', () => {
  it('normalizes spacing and case', () => {
    expect(normalizeVoucherCode('  demo-aaaa-bbbb-cccc  ')).toBe('DEMO-AAAA-BBBB-CCCC')
    expect(normalizeVoucherCode('dsr-AAAA-bbbb-cccc')).toBe('DSR-AAAA-BBBB-CCCC')
  })

  it('accepts compact pasted codes', () => {
    expect(normalizeVoucherCode('DEMOAAAABBBBCCCC')).toBe('DEMO-AAAA-BBBB-CCCC')
    expect(normalizeVoucherCode('DSRAAAABBBBCCCC')).toBe('DSR-AAAA-BBBB-CCCC')
  })

  it('rejects invalid codes', () => {
    expect(normalizeVoucherCode('')).toBeNull()
    expect(normalizeVoucherCode('HELLO')).toBeNull()
    expect(normalizeVoucherCode('DEMO-AAAA-BBBB')).toBeNull()
  })
})

describe('redeem eligibility mirrors', () => {
  const base = {
    code: 'DSR-AAAA-BBBB-CCCC',
    amountCents: 5000,
    currency: 'AUD',
    campaignId: 'event-three-rooftop-v1',
    rewardTierId: 'tier_50',
    issuedAt: '2026-11-18T00:00:00.000Z',
    expiresAt: '2027-02-16T00:00:00.000Z',
    status: 'issued',
    demo: false,
    redeemable: true,
    redeemedAt: null,
  }

  it('marks demo / non-redeemable vouchers as not redeemable', () => {
    expect(
      deriveDisplayStatus({ ...base, demo: true, redeemable: false }),
    ).toBe('not_redeemable')
    expect(canOfferRedeem({ ...base, demo: true, redeemable: false }, LIVE_GATE)).toBe(false)
  })

  it('requires live issuance gate even for redeemable rows', () => {
    expect(isLiveIssuanceGate(DEMO_GATE)).toBe(false)
    expect(isLiveIssuanceGate(LIVE_GATE)).toBe(true)
    expect(canOfferRedeem(base, DEMO_GATE)).toBe(false)
    expect(canOfferRedeem(base, LIVE_GATE)).toBe(true)
  })

  it('keeps redeemed searchable state without offering redeem', () => {
    const redeemed = {
      ...base,
      status: 'redeemed',
      redeemedAt: '2026-11-18T04:30:00.000Z',
    }
    expect(deriveDisplayStatus(redeemed)).toBe('redeemed')
    expect(canOfferRedeem(redeemed, LIVE_GATE)).toBe(false)
  })

  it('detects expiration from expiresAt', () => {
    expect(
      deriveDisplayStatus(
        { ...base, expiresAt: '2020-01-01T00:00:00.000Z' },
        Date.parse('2026-11-18T00:00:00.000Z'),
      ),
    ).toBe('expired')
  })
})

describe('Canberra formatting', () => {
  it('formats redeemed message in Australia/Canberra', () => {
    const msg = redeemedMessageCanberra('2026-11-18T03:00:00.000Z')
    expect(msg.startsWith('This code has been redeemed on ')).toBe(true)
    expect(formatCanberraDateTime('2026-11-18T03:00:00.000Z')).toMatch(/2026/)
  })
})

describe('staff password + session', () => {
  it('verifies scrypt password hashes without exposing plaintext', () => {
    const encoded = hashStaffPassword('correct-horse-battery')
    expect(encoded.startsWith('scrypt:')).toBe(true)
    expect(encoded.includes('$')).toBe(false)
    expect(verifyStaffPassword('correct-horse-battery', encoded)).toBe(true)
    expect(verifyStaffPassword('wrong', encoded)).toBe(false)
  })

  it('issues and verifies short-lived signed sessions', () => {
    const secret = 'x'.repeat(32)
    const { token, payload } = createStaffSessionToken(secret, 1_700_000_000, 60)
    expect(verifyStaffSessionToken(token, secret, 1_700_000_010)?.jti).toBe(payload.jti)
    expect(verifyStaffSessionToken(token, secret, 1_700_000_100)).toBeNull()
    expect(verifyStaffSessionToken(token + 'tampered', secret, 1_700_000_010)).toBeNull()
  })

  it('builds HttpOnly SameSite cookies', () => {
    const set = staffSessionCookieHeader('abc.def', { maxAgeSeconds: 120, secure: true })
    expect(set).toContain(`${STAFF_SESSION_COOKIE}=abc.def`)
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Strict')
    expect(set).toContain('Secure')
    const cleared = clearStaffSessionCookieHeader(true)
    expect(cleared).toContain('Max-Age=0')
    expect(readCookie(`${STAFF_SESSION_COOKIE}=tok; Path=/`, STAFF_SESSION_COOKIE)).toBe('tok')
  })
})

describe('migration security contracts', () => {
  it('keeps redeem RPCs service_role only and does not flip real_redeemable', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260330000000_staff_voucher_redemption.sql'),
      'utf8',
    )
    expect(sql).toContain('staff_lookup_promotional_voucher')
    expect(sql).toContain('staff_redeem_promotional_voucher')
    expect(sql).toContain('for update')
    expect(sql).toContain("status = 'issued'")
    expect(sql).toContain('real_redeemable is not true')
    expect(sql).toContain(
      'grant execute on function public.staff_redeem_promotional_voucher(text, text) to service_role',
    )
    expect(sql).toContain(
      'revoke all on function public.staff_redeem_promotional_voucher(text, text) from public, anon, authenticated',
    )
    expect(sql).not.toMatch(/real_redeemable\s*=\s*true/i)
    expect(sql).not.toMatch(
      /grant execute on function public\.staff_(lookup|redeem)_promotional_voucher\([^)]*\) to (anon|authenticated|public)/i,
    )
  })

  it('does not expose staff password via VITE env in staff API', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const login = readFileSync(resolve(process.cwd(), 'api/staff/login.ts'), 'utf8')
    const env = readFileSync(resolve(process.cwd(), 'api/_lib/env.ts'), 'utf8')
    expect(env).toContain('STAFF_PASSWORD_HASH')
    expect(env).not.toContain('VITE_STAFF_PASSWORD')
    expect(login).not.toContain('VITE_STAFF_PASSWORD')
    expect(login).toContain('assertLoginAllowed')
    expect(login).toContain('staffPasswordHash')
  })
})
