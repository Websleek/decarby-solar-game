export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

export function supabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    ''
  )
}

export function supabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
}

export function staffPasswordHash(): string {
  return process.env.STAFF_PASSWORD_HASH?.trim() || ''
}

export function staffSessionSecret(): string {
  return process.env.STAFF_SESSION_SECRET?.trim() || ''
}

export function isSecureCookieRequest(req: { headers: { host?: string; 'x-forwarded-proto'?: string } }): boolean {
  const proto = req.headers['x-forwarded-proto']
  if (proto) return proto.split(',')[0]?.trim() === 'https'
  const host = req.headers.host ?? ''
  return !host.includes('localhost') && !host.startsWith('127.0.0.1')
}
