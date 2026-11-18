/**
 * Server-side allowlist for demo/test Resend sends.
 * VOUCHER_EMAIL_SEND_DEMO alone must never authorize public demo emails.
 *
 * Env: VOUCHER_EMAIL_TEST_ALLOWLIST=qa1@example.com,qa2@example.com
 */

import { normalizeEmail } from './emailNormalize.ts'

export function parseEmailAllowlist(raw: string | null | undefined): readonly string[] {
  if (!raw || raw.trim().length === 0) return []
  const out: string[] = []
  for (const part of raw.split(/[,;\s]+/)) {
    const normalized = normalizeEmail(part)
    if (normalized.ok) out.push(normalized.normalized)
  }
  return Object.freeze([...new Set(out)])
}

export function isAllowlistedRecipient(
  recipient: string,
  allowlist: readonly string[],
): boolean {
  if (allowlist.length === 0) return false
  const normalized = normalizeEmail(recipient)
  if (!normalized.ok) return false
  return allowlist.includes(normalized.normalized)
}

/**
 * Decide whether this recipient may receive a real provider API call for a
 * non-redeemable/demo voucher. Fail closed when allowlist is empty/missing.
 */
export function canSendDemoEmailViaProvider(input: {
  toEmail: string
  demo: boolean
  redeemable: boolean
  sendDemoViaProvider: boolean
  testAllowlist: readonly string[]
}): { allowed: boolean; reason: string } {
  const isDemoVoucher = input.demo || !input.redeemable
  if (!isDemoVoucher) {
    return { allowed: true, reason: 'live_redeemable_path' }
  }
  if (!input.sendDemoViaProvider) {
    return { allowed: false, reason: 'demo_send_flag_off' }
  }
  if (input.testAllowlist.length === 0) {
    return { allowed: false, reason: 'allowlist_empty_fail_closed' }
  }
  if (!isAllowlistedRecipient(input.toEmail, input.testAllowlist)) {
    return { allowed: false, reason: 'recipient_not_allowlisted' }
  }
  return { allowed: true, reason: 'allowlisted_demo_test' }
}
