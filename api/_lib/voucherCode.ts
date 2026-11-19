export function isPlausibleVoucherCode(code: string): boolean {
  return /^(DEMO|DSR)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)
}

export function normalizeVoucherCode(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const compact = raw.trim().toUpperCase().replace(/[\s_]+/g, '')
  if (!compact) return null

  let candidate = compact
  const bare = compact.replace(/-/g, '')
  if (/^(DEMO|DSR)[A-Z0-9]{12}$/.test(bare)) {
    const prefix = bare.slice(0, bare.startsWith('DEMO') ? 4 : 3)
    const body = bare.slice(prefix.length)
    candidate = `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
  }

  if (!isPlausibleVoucherCode(candidate)) return null
  return candidate
}
