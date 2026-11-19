import { describe, expect, it } from 'vitest'
import {
  canSendDemoEmailViaProvider,
  isAllowlistedRecipient,
  parseEmailAllowlist,
} from './emailTestAllowlist'
import {
  classifyEmailDelivery,
  emailDeliveryUserMessage,
  FORBIDDEN_INBOX_PHRASES,
} from './emailDeliveryStatus'
import { buildVoucherEmail } from './voucherEmailTemplate'

describe('email test allowlist', () => {
  it('parses and normalizes allowlist entries', () => {
    const list = parseEmailAllowlist(' QA@Example.com , other@decarbysolar.com.au ')
    expect(list).toEqual(['qa@example.com', 'other@decarbysolar.com.au'])
    expect(isAllowlistedRecipient('qa@example.com', list)).toBe(true)
    expect(isAllowlistedRecipient('stranger@example.com', list)).toBe(false)
  })

  it('fails closed when VOUCHER_EMAIL_SEND_DEMO is on but allowlist is empty', () => {
    const gate = canSendDemoEmailViaProvider({
      toEmail: 'anyone@example.com',
      demo: true,
      redeemable: false,
      sendDemoViaProvider: true,
      testAllowlist: [],
    })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe('allowlist_empty_fail_closed')
  })

  it('allows only allowlisted demo recipients when send-demo is enabled', () => {
    const list = parseEmailAllowlist('qa@decarbysolar.com.au')
    expect(
      canSendDemoEmailViaProvider({
        toEmail: 'qa@decarbysolar.com.au',
        demo: true,
        redeemable: false,
        sendDemoViaProvider: true,
        testAllowlist: list,
      }).allowed,
    ).toBe(true)
    expect(
      canSendDemoEmailViaProvider({
        toEmail: 'player@example.com',
        demo: true,
        redeemable: false,
        sendDemoViaProvider: true,
        testAllowlist: list,
      }).allowed,
    ).toBe(false)
  })
})

describe('delivery status honesty for Resend demo tests', () => {
  it('classifies Resend acceptance separately from demo_log even for non-redeemable codes', () => {
    const kind = classifyEmailDelivery({
      emailStatus: 'sent',
      emailProvider: 'resend',
      demo: true,
      redeemable: false,
    })
    expect(kind).toBe('provider_accepted')
    expect(emailDeliveryUserMessage(kind)).toBe(
      'Your voucher email has been submitted for delivery.',
    )
  })

  it('keeps demo_log copy free of inbox claims', () => {
    const message = emailDeliveryUserMessage('demo_log').toLowerCase()
    expect(message).toContain('no email was sent')
    for (const phrase of FORBIDDEN_INBOX_PHRASES) {
      expect(message).not.toContain(phrase)
    }
  })
})

describe('voucher email template demo safety', () => {
  it('marks demo content as non-redeemable and escapes HTML', () => {
    const content = buildVoucherEmail({
      fullName: 'Test <script>alert(1)</script>',
      amountCents: 10000,
      voucherCode: 'DEMO-AAAA-BBBB-CCCC',
      expiresAtIso: '2027-01-01T00:00:00.000Z',
      demo: true,
      redeemable: false,
      termsVersion: 'promo-terms-v1',
      totalStars: 8,
    })
    expect(content.subject.toLowerCase()).toMatch(/test|demo/)
    expect(content.html).toContain('NOT REDEEMABLE')
    expect(content.html).toContain('8 / 9')
    expect(content.html).toContain('&lt;script&gt;')
    expect(content.html).not.toContain('<script>alert')
    expect(content.text.toLowerCase()).toMatch(/not redeemable/)
    expect(content.html).toMatch(/not applicable|not redeemable/i)
    expect(content.html).not.toMatch(/promo-terms-v1/)
  })

  it('shows No expiry on genuine non-expiring vouchers', () => {
    const content = buildVoucherEmail({
      fullName: 'Jordan',
      amountCents: 50000,
      voucherCode: 'DSR-ZZZZ-YYYY-XXXX',
      expiresAtIso: null,
      demo: false,
      redeemable: true,
      termsVersion: 'promo-terms-v1',
    })
    expect(content.subject).toContain('A$500 OFF')
    expect(content.html).toContain('No expiry')
    expect(content.text).toContain('No expiry')
    expect(content.html).not.toMatch(/TEST \/ DEMO/)
    expect(content.html).not.toContain('promo-terms-v1')
  })
})
