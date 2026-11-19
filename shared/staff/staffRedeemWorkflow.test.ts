import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redeemedMessageCanberra } from './canberraTime'
import { canOfferRedeem, deriveDisplayStatus } from './redeemEligibility'

const LIVE = { mode: 'approved_live', claimsEnabled: true, realRedeemable: true } as const
const DEMO_GATE = { mode: 'demo', claimsEnabled: true, realRedeemable: false } as const

const issuedLive = {
  code: 'DSR-T50A-T50B-T50C',
  amountCents: 5000,
  currency: 'AUD',
  campaignId: 'staff-redeem-test-v1',
  rewardTierId: 'tier_50',
  issuedAt: '2026-11-19T00:00:00.000Z',
  expiresAt: '2026-12-19T00:00:00.000Z',
  status: 'issued',
  demo: false,
  redeemable: true,
  redeemedAt: null,
}

describe('staff redeem UI eligibility', () => {
  it('enables Redeem only for issued live redeemable vouchers under live gate', () => {
    expect(deriveDisplayStatus(issuedLive)).toBe('valid')
    expect(canOfferRedeem(issuedLive, LIVE)).toBe(true)
    expect(canOfferRedeem(issuedLive, DEMO_GATE)).toBe(false)
  })

  it('disables Redeem and shows Canberra redeemed message after redemption', () => {
    const redeemedAt = '2026-11-19T00:30:00.000Z'
    const redeemed = {
      ...issuedLive,
      status: 'redeemed',
      redeemedAt,
    }
    expect(deriveDisplayStatus(redeemed)).toBe('redeemed')
    expect(canOfferRedeem(redeemed, LIVE)).toBe(false)
    const message = redeemedMessageCanberra(redeemedAt)
    expect(message.startsWith('This code has been redeemed on ')).toBe(true)
    expect(message).toMatch(/2026/)
  })

  it('keeps DEMO / non-redeemable vouchers non-redeemable without trusting prefix alone', () => {
    const demo = { ...issuedLive, code: 'DEMO-AAAA-BBBB-CCCC', demo: true, redeemable: false }
    expect(deriveDisplayStatus(demo)).toBe('not_redeemable')
    expect(canOfferRedeem(demo, LIVE)).toBe(false)
  })
})

describe('staff_redeem_promotional_voucher SQL contracts', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260330000000_staff_voucher_redemption.sql'),
    'utf8',
  )

  it('locks the voucher row and only updates issued → redeemed once', () => {
    expect(sql).toContain('for update')
    expect(sql).toContain("status = 'issued'")
    expect(sql).toContain("status = 'redeemed'")
    expect(sql).toContain('redeemed_at = v_now')
  })

  it('requires approved_live + claims_enabled + real_redeemable and rejects demo rows', () => {
    expect(sql).toContain("mode is distinct from 'approved_live'")
    expect(sql).toContain('claims_enabled is not true')
    expect(sql).toContain('real_redeemable is not true')
    expect(sql).toContain('v_voucher.demo is true or v_voucher.redeemable is not true')
  })

  it('writes immutable audit events and preserves already_redeemed timestamp in payload', () => {
    expect(sql).toContain("event_type in ('redeemed', 'redeem_rejected')")
    expect(sql).toContain("reason', 'already_redeemed'")
    expect(sql).toContain('promotional_voucher_redemption_events are immutable')
    expect(sql).not.toMatch(/real_redeemable\s*=\s*true/)
  })
})

describe('atomic single-use race (in-memory mirror of SQL update gate)', () => {
  it('allows only one concurrent winner when both start from issued', async () => {
    type Row = { status: 'issued' | 'redeemed'; redeemedAt: string | null }
    const row: Row = { status: 'issued', redeemedAt: null }

    async function attempt(jti: string): Promise<{ ok: boolean; code: string; jti: string }> {
      // Simulate BEGIN … SELECT FOR UPDATE … UPDATE WHERE status='issued'
      await Promise.resolve()
      if (row.status === 'redeemed') {
        return { ok: false, code: 'already_redeemed', jti }
      }
      // critical section
      if (row.status !== 'issued') {
        return { ok: false, code: 'already_redeemed', jti }
      }
      row.status = 'redeemed'
      row.redeemedAt = '2026-11-19T01:00:00.000Z'
      return { ok: true, code: 'redeemed', jti }
    }

    // Sequential critical sections still model the DB gate; for true parallel we
    // use an atomic compare-exchange style lock.
    let locked = false
    async function attemptAtomic(jti: string): Promise<{ ok: boolean; code: string; jti: string }> {
      while (locked) {
        await Promise.resolve()
      }
      locked = true
      try {
        if (row.status === 'redeemed') return { ok: false, code: 'already_redeemed', jti }
        if (row.status !== 'issued') return { ok: false, code: 'already_redeemed', jti }
        row.status = 'redeemed'
        const stamp = '2026-11-19T01:00:00.000Z'
        row.redeemedAt = stamp
        return { ok: true, code: 'redeemed', jti }
      } finally {
        locked = false
      }
    }

    // Reset and race with mutex approximating FOR UPDATE serialization.
    row.status = 'issued'
    row.redeemedAt = null
    const results = await Promise.all([attemptAtomic('a'), attemptAtomic('b')])
    const wins = results.filter((r) => r.ok)
    const losses = results.filter((r) => !r.ok)
    expect(wins).toHaveLength(1)
    expect(losses).toHaveLength(1)
    expect(losses[0]?.code).toBe('already_redeemed')
    expect(row.redeemedAt).toBe('2026-11-19T01:00:00.000Z')

    const retry = await attempt('c')
    expect(retry.ok).toBe(false)
    expect(row.redeemedAt).toBe('2026-11-19T01:00:00.000Z')
  })
})

describe('staging harness safety', () => {
  it('integration script refuses production and isolates staff-redeem-test-v1', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'scripts/staging/run-staff-redeem-integration.mjs'),
      'utf8',
    )
    expect(src).toContain("PROD_REF = 'lrohmaodpqbmvgxsspql'")
    expect(src).toContain("KNOWN_STAGING_REF = 'ixsejdbiyfrhtxxfagls'")
    expect(src).toContain('staff-redeem-test-v1')
    expect(src).toContain('event-three-rooftop-v1')
    expect(src).toContain('refuses_production')
    expect(src).toContain('refuses_production_local_url_reuse')
    expect(src).toContain('concurrent_single_winner')
    expect(src).not.toMatch(/update\s+promotional_issuance_config[\s\S]*event-three-rooftop-v1/)
  })
})
