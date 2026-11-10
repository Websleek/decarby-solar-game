/**
 * Final B — email normalization policy for unique voucher claims.
 *
 * Policy (documented + enforced in DB unique index on email_normalized):
 * 1. Trim surrounding whitespace from the raw input.
 * 2. Reject addresses with internal whitespace or control characters.
 * 3. Lowercase the entire address (local-part + domain) for comparison storage.
 * 4. Apply a conservative shape check (single @, valid chars, length bounds).
 *
 * Rationale: lowercasing the full address is deliberately conservative and may
 * treat `User@Example.com` and `user@example.com` as the same claimant. We do
 * not attempt provider-specific local-part canonicalization (plus-tags, dots).
 */

export const EMAIL_MAX_LENGTH = 320
export const EMAIL_MIN_LENGTH = 3

export type EmailNormalizeResult =
  | Readonly<{ ok: true; raw: string; normalized: string }>
  | Readonly<{ ok: false; code: 'invalid_email'; reason: string }>

const EMAIL_SHAPE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

export function normalizeEmail(input: unknown): EmailNormalizeResult {
  if (typeof input !== 'string') {
    return { ok: false, code: 'invalid_email', reason: 'Enter a valid email address.' }
  }
  const raw = input.trim()
  if (raw.length < EMAIL_MIN_LENGTH || raw.length > EMAIL_MAX_LENGTH) {
    return { ok: false, code: 'invalid_email', reason: 'Enter a valid email address.' }
  }
  if (/\s/.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) {
    return { ok: false, code: 'invalid_email', reason: 'Enter a valid email address.' }
  }
  if ((raw.match(/@/g) ?? []).length !== 1) {
    return { ok: false, code: 'invalid_email', reason: 'Enter a valid email address.' }
  }
  if (!EMAIL_SHAPE.test(raw)) {
    return { ok: false, code: 'invalid_email', reason: 'Enter a valid email address.' }
  }
  return { ok: true, raw, normalized: raw.toLowerCase() }
}

export function emailsMatchForClaim(a: string, b: string): boolean {
  const left = normalizeEmail(a)
  const right = normalizeEmail(b)
  return left.ok && right.ok && left.normalized === right.normalized
}
