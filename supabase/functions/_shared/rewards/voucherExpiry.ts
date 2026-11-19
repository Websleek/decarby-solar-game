/**
 * Expiry presentation helpers.
 * NULL / empty expires_at means non-expiring — never invent a future date.
 */

export function hasVoucherExpiry(expiresAt: string | null | undefined): boolean {
  if (expiresAt == null) return false
  const trimmed = String(expiresAt).trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return false
  const ms = Date.parse(trimmed)
  return !Number.isNaN(ms)
}

/** Customer / staff label. Live non-expiring → "No expiry". */
export function formatVoucherExpiryLabel(
  expiresAt: string | null | undefined,
  options?: { demo?: boolean; redeemable?: boolean; locale?: string },
): string {
  const demo = options?.demo === true || options?.redeemable === false
  if (!hasVoucherExpiry(expiresAt)) {
    return demo ? 'Not applicable (non-redeemable demo code)' : 'No expiry'
  }
  const d = new Date(String(expiresAt))
  return d.toLocaleDateString(options?.locale ?? 'en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** True when a stored expiry policy has elapsed. NULL expiry never expires. */
export function isPastVoucherExpiry(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!hasVoucherExpiry(expiresAt)) return false
  return Date.parse(String(expiresAt)) <= nowMs
}
