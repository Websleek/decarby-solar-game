import { describe, expect, it } from 'vitest'
import { PROMOTIONAL_TERMS_VERSION } from './consent'
import {
  normalizeAuPhone,
  validateFullName,
  validateVoucherContactForm,
} from './contactValidation'
import { emailsMatchForClaim, normalizeEmail } from './emailNormalize'
import { generateVoucherCode, isPlausibleVoucherCode } from './voucherCode'
import { InMemoryEmailClaimLedger, successMessage } from './voucherClaim'
import { buildVoucherEmail } from './voucherEmailTemplate'
import {
  canAcceptClaims,
  DEMO_SEED_ISSUANCE,
  FAIL_CLOSED_ISSUANCE,
  isRedeemableIssuance,
} from './issuanceConfig'

describe('email normalization', () => {
  it('trims and lowercases for comparison', () => {
    const a = normalizeEmail('  Alex@Example.COM ')
    const b = normalizeEmail('alex@example.com')
    expect(a.ok && b.ok && a.normalized === b.normalized).toBe(true)
    expect(emailsMatchForClaim('Alex@Example.COM', 'alex@example.com')).toBe(true)
  })

  it('rejects invalid shapes', () => {
    expect(normalizeEmail('not-an-email').ok).toBe(false)
    expect(normalizeEmail('a b@c.com').ok).toBe(false)
    expect(normalizeEmail('a@b@c.com').ok).toBe(false)
  })
})

describe('contact validation', () => {
  it('validates AU phones and names', () => {
    expect(validateFullName('  Jane Q. Citizen ').ok).toBe(true)
    expect(normalizeAuPhone('0412 345 678').ok).toBe(true)
    expect(normalizeAuPhone('+61 412 345 678').ok).toBe(true)
    expect(normalizeAuPhone('02 9123 4567').ok).toBe(true)
    expect(normalizeAuPhone('+1 555 123 4567').ok).toBe(false)
  })

  it('requires consents and rejects invalid consent', () => {
    const missing = validateVoucherContactForm({
      fullName: 'Jane Citizen',
      phone: '0412345678',
      email: 'jane@example.com',
      termsAccepted: false,
      adultSelfAttested: true,
      marketingOptIn: false,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
    })
    expect(missing.ok).toBe(false)

    const adult = validateVoucherContactForm({
      fullName: 'Jane Citizen',
      phone: '0412345678',
      email: 'jane@example.com',
      termsAccepted: true,
      adultSelfAttested: false,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
    })
    expect(adult.ok).toBe(false)

    const ok = validateVoucherContactForm({
      fullName: 'Jane Citizen',
      phone: '0412345678',
      email: 'jane@example.com',
      termsAccepted: true,
      adultSelfAttested: true,
      marketingOptIn: false,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.marketingOptIn).toBe(false)
  })

  it('ignores client amount fields for form validity', () => {
    const ok = validateVoucherContactForm({
      fullName: 'Jane Citizen',
      phone: '0412345678',
      email: 'jane@example.com',
      termsAccepted: true,
      adultSelfAttested: true,
      amountCents: 999999,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
    })
    expect(ok.ok).toBe(true)
  })
})

describe('unique email ledger (concurrent model)', () => {
  it('allows one claim per email and is idempotent for the same run', async () => {
    const ledger = new InMemoryEmailClaimLedger()
    const base = {
      campaignId: 'classic-five-rooftop-v1',
      emailNormalized: 'hero@example.com',
      playerId: 'player-a',
      runId: 'run-1',
    }
    const first = ledger.tryReserve(base)
    const again = ledger.tryReserve(base)
    expect(first.ok && again.ok && first.claimId === again.claimId).toBe(true)
    if (again.ok) expect(again.idempotent).toBe(true)

    const racing = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        Promise.resolve(
          ledger.tryReserve({
            ...base,
            playerId: 'player-b',
            runId: `other-${i}`,
          }),
        ),
      ),
    )
    expect(racing.every((r) => !r.ok && r.code === 'email_already_used')).toBe(true)
  })
})

describe('voucher codes and email template', () => {
  it('generates unguessable plausible codes', () => {
    const a = generateVoucherCode({ demo: true })
    const b = generateVoucherCode({ demo: true })
    expect(a).not.toEqual(b)
    expect(isPlausibleVoucherCode(a)).toBe(true)
    expect(a.startsWith('DEMO-')).toBe(true)
  })

  it('builds demo email copy without redeemable promises', () => {
    const content = buildVoucherEmail({
      fullName: 'Alex',
      amountCents: 10000,
      voucherCode: 'DEMO-AAAA-BBBB-CCCC',
      expiresAtIso: '2027-01-01T00:00:00.000Z',
      demo: true,
      redeemable: false,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
    })
    expect(content.subject.toLowerCase()).toContain('demo')
    expect(content.text).toMatch(/no redeemable/i)
  })
})

describe('issuance gates', () => {
  it('keeps fail-closed and demo seed non-redeemable', () => {
    expect(canAcceptClaims(FAIL_CLOSED_ISSUANCE)).toBe(false)
    expect(isRedeemableIssuance(FAIL_CLOSED_ISSUANCE)).toBe(false)
    expect(canAcceptClaims(DEMO_SEED_ISSUANCE)).toBe(true)
    expect(isRedeemableIssuance(DEMO_SEED_ISSUANCE)).toBe(false)
    expect(successMessage({ demo: true, redeemable: false, idempotent: false })).toMatch(/demo/i)
  })
})
