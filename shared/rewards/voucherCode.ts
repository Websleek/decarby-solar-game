/**
 * Final B — cryptographically secure voucher code generation (server-side only).
 * Browser must never generate or accept client-supplied codes as authoritative.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateVoucherCode(options: { demo: boolean }): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let raw = ''
  for (const byte of bytes) {
    raw += ALPHABET[byte % ALPHABET.length]!
  }
  const grouped = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
  return options.demo ? `DEMO-${grouped}` : `DSR-${grouped}`
}

export function isPlausibleVoucherCode(code: string): boolean {
  return /^(DEMO|DSR)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)
}
