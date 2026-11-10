const buckets = new Map<string, { count: number; resetAt: number }>()

export function clientKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'anonymous'
  )
}

export function takeRateToken(
  key: string,
  opts: { windowMs?: number; max?: number } = {},
): boolean {
  const windowMs = opts.windowMs ?? 60_000
  const max = opts.max ?? 30
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}
