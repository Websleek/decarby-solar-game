/**
 * Customer-facing claim error copy.
 * Never surface SQL, stack traces, or internal exception text.
 */

export const CLAIM_ERROR_FALLBACK =
  'Could not process your voucher request. Please try again.' as const

export const CLAIM_NETWORK_ERROR =
  'Could not reach the online service. Check your connection and try again.' as const

const KNOWN_CLAIM_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  email_already_used:
    'This email has already been used to claim a voucher for this promotion. Please use your original voucher.',
  adult_attestation_required: 'Please confirm that you are 18 years of age or older.',
  terms_required: 'Please accept the Decarby promotional terms to continue.',
  terms_version_mismatch:
    'Please refresh the page and accept the current promotional terms to continue.',
  invalid_email: 'Please enter a valid email address.',
  invalid_contact: 'Please check your name, email and required confirmations.',
  invalid_name: 'Please enter your full name.',
  invalid_phone: 'Please enter a valid Australian phone number, or leave it blank.',
  rate_limited: 'Too many voucher requests. Please wait a moment and try again.',
  not_eligible: 'This completed run is not eligible for a voucher right now.',
  claims_disabled: 'Voucher claims are not available for this promotion right now.',
  run_not_found: 'We could not find this challenge run. Please return home and try again.',
  forbidden: 'This challenge run does not belong to the signed-in player.',
  unauthenticated: 'Please reconnect online, then try claiming your voucher again.',
  profile_required: 'An online player profile is required before claiming a voucher.',
  unverified_result: 'Your results are still verifying. Please wait a moment and try again.',
  incomplete_campaign: 'Finish all rooftops in this challenge before claiming a voucher.',
  not_configured: 'Online voucher claiming is unavailable right now.',
  claim_failed: CLAIM_ERROR_FALLBACK,
  server_error: CLAIM_ERROR_FALLBACK,
  invalid_request: 'Please check your details and try again.',
  method_not_allowed: CLAIM_ERROR_FALLBACK,
})

const UNSAFE_MESSAGE =
  /sqlstate|postgres|duplicate key|unique constraint|permission denied|relation ["']|column ["']|syntax error|traceback|exception:|typeerror:|internal server|^error:/i

function looksSafePublicMessage(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length < 8 || trimmed.length > 240) return false
  if (trimmed.includes('\n') || trimmed.includes('\t')) return false
  if (UNSAFE_MESSAGE.test(trimmed)) return false
  return true
}

/**
 * Map a structured claim error code (+ optional Edge message) to UI copy.
 */
export function customerMessageForClaimError(
  code: string | null | undefined,
  serverMessage?: string | null,
): string {
  const normalized = typeof code === 'string' ? code.trim() : ''
  if (normalized && KNOWN_CLAIM_MESSAGES[normalized]) {
    return KNOWN_CLAIM_MESSAGES[normalized]
  }
  if (typeof serverMessage === 'string' && looksSafePublicMessage(serverMessage)) {
    return serverMessage.trim()
  }
  return CLAIM_ERROR_FALLBACK
}

export function parseClaimErrorPayload(payload: unknown): {
  code: string
  message: string
} | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code : ''
  const message = typeof record.message === 'string' ? record.message : null
  if (!code && !message) return null
  return {
    code: code || 'claim_failed',
    message: customerMessageForClaimError(code || 'claim_failed', message),
  }
}
