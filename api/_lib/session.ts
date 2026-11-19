/**
 * Serverless-local staff session helpers (CommonJS-friendly for Vercel).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const STAFF_SESSION_COOKIE = 'decarby_staff_sess'
export const STAFF_SESSION_TTL_SECONDS = 60 * 60 * 2

export type StaffSessionPayload = Readonly<{
  v: 1
  iat: number
  exp: number
  jti: string
}>

function b64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  return buf.toString('base64url')
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function createStaffSessionToken(
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = STAFF_SESSION_TTL_SECONDS,
): { token: string; payload: StaffSessionPayload } {
  if (!secret || secret.length < 32) {
    throw new Error('STAFF_SESSION_SECRET must be at least 32 characters.')
  }
  const payload: StaffSessionPayload = {
    v: 1,
    iat: nowSec,
    exp: nowSec + ttlSeconds,
    jti: randomBytes(16).toString('hex'),
  }
  const body = b64url(JSON.stringify(payload))
  const token = `${body}.${sign(body, secret)}`
  return { token, payload }
}

export function verifyStaffSessionToken(
  token: string | undefined | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): StaffSessionPayload | null {
  if (!token || !secret || secret.length < 32) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  if (!body || !sig) return null
  const expected = sign(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StaffSessionPayload
    if (parsed.v !== 1) return null
    if (typeof parsed.jti !== 'string' || parsed.jti.length < 16) return null
    if (typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number') return null
    if (parsed.exp <= nowSec) return null
    if (parsed.iat > nowSec + 60) return null
    return parsed
  } catch {
    return null
  }
}

export function staffSessionCookieHeader(
  token: string,
  options: { maxAgeSeconds: number; secure: boolean },
): string {
  const parts = [
    `${STAFF_SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearStaffSessionCookieHeader(secure: boolean): string {
  const parts = [
    `${STAFF_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  const parts = header.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key !== name) continue
    return part.slice(idx + 1).trim()
  }
  return null
}
