import { describe, expect, it } from 'vitest'
import {
  classifyEmailDelivery,
  emailDeliveryUserMessage,
  FORBIDDEN_INBOX_PHRASES,
} from './emailDeliveryStatus'

describe('email delivery status messaging', () => {
  it('labels demo_log as simulated, never inbox delivery', () => {
    const kind = classifyEmailDelivery({
      emailStatus: 'sent',
      emailProvider: 'demo_log',
      demo: true,
      redeemable: false,
    })
    expect(kind).toBe('demo_log')
    const message = emailDeliveryUserMessage(kind).toLowerCase()
    expect(message).toMatch(/demo mode/)
    expect(message).toMatch(/not sent to a real inbox/)
    for (const phrase of FORBIDDEN_INBOX_PHRASES) {
      expect(message).not.toContain(phrase)
    }
  })

  it('distinguishes provider acceptance from inbox delivery', () => {
    const kind = classifyEmailDelivery({
      emailStatus: 'sent',
      emailProvider: 'resend',
      demo: false,
      redeemable: true,
    })
    expect(kind).toBe('provider_accepted')
    expect(emailDeliveryUserMessage(kind).toLowerCase()).toMatch(/not guaranteed/)
  })

  it('preserves failed/retry messaging without minting language', () => {
    const message = emailDeliveryUserMessage('failed').toLowerCase()
    expect(message).toMatch(/preserved/)
    expect(message).toMatch(/retried|retry/)
  })
})
