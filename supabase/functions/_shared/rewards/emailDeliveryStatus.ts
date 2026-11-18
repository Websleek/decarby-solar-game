/**
 * User-facing email delivery status copy.
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

  // Provider identity wins over demo/redeemable content flags.
  if (input.emailProvider === 'demo_log') return 'demo_log'
  if (input.emailStatus === 'sent' && input.emailProvider === 'resend') {
    return 'provider_accepted'
  }
  if (input.emailStatus === 'sent') {
    return input.demo || input.redeemable === false ? 'demo_log' : 'provider_accepted'
  }
  return 'unknown'
}

export function emailDeliveryUserMessage(kind: EmailDeliveryKind): string {
  switch (kind) {
    case 'demo_log':
      return 'Delivery was recorded in demo mode only. No email was sent.'
    case 'provider_accepted':
      return 'Your voucher email has been submitted for delivery.'
    case 'failed':
      return "We couldn't send your email. Your voucher record is saved."
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
  'delivered to your inbox',
] as const
