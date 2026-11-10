/**
 * Final C — user-facing email delivery status copy.
 * Never claim inbox delivery from demo_log or provider acceptance alone.
 */

export type EmailDeliveryKind = 'demo_log' | 'provider_accepted' | 'failed' | 'queued' | 'unknown'

export function classifyEmailDelivery(input: {
  emailStatus?: string | null
  emailProvider?: string | null
  demo?: boolean
  redeemable?: boolean
}): EmailDeliveryKind {
  if (input.emailStatus === 'failed') return 'failed'
  if (input.emailStatus === 'queued') return 'queued'
  if (input.emailProvider === 'demo_log' || input.demo || input.redeemable === false) {
    if (input.emailStatus === 'sent' || input.emailProvider === 'demo_log') return 'demo_log'
  }
  if (input.emailStatus === 'sent' && input.emailProvider === 'resend') return 'provider_accepted'
  if (input.emailStatus === 'sent') {
    return input.redeemable === true ? 'provider_accepted' : 'demo_log'
  }
  return 'unknown'
}

export function emailDeliveryUserMessage(kind: EmailDeliveryKind): string {
  switch (kind) {
    case 'demo_log':
      return 'Delivery was recorded in demo mode only — this was not sent to a real inbox.'
    case 'provider_accepted':
      return 'The email provider accepted the message. Inbox delivery is not guaranteed.'
    case 'failed':
      return 'Email delivery failed temporarily. Your voucher was preserved and can be retried without issuing a new code.'
    case 'queued':
      return 'Email delivery is queued.'
    default:
      return 'Email delivery status is unavailable.'
  }
}

/** Forbidden phrases that must never appear for simulated delivery. */
export const FORBIDDEN_INBOX_PHRASES = [
  'sent to your inbox',
  'check your inbox',
  'voucher emailed to you',
] as const
