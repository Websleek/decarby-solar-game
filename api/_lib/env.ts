import { normalizeStaffPasswordHashEnv } from './password'

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

/** Reads STAFF_PASSWORD_HASH only — never a VITE_ public var. */
export function staffPasswordHash(): string {
  return normalizeStaffPasswordHashEnv(process.env.STAFF_PASSWORD_HASH)
}

export function staffSessionSecret(): string {
  return process.env.STAFF_SESSION_SECRET?.trim() || ''
}

export function isSecureCookieRequest(req: {
  headers: { host?: string; 'x-forwarded-proto'?: string | string[] }
}): boolean {
  const protoHeader = req.headers['x-forwarded-proto']
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader
  if (proto) return proto.split(',')[0]?.trim() === 'https'
  const host = req.headers.host ?? ''
  return !host.includes('localhost') && !host.startsWith('127.0.0.1')
}
