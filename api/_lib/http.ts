import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  STAFF_SESSION_COOKIE,
  clearStaffSessionCookieHeader,
  readCookie,
  verifyStaffSessionToken,
  type StaffSessionPayload,
} from './session'
import { isSecureCookieRequest, staffSessionSecret } from './env'

export function json(
  res: VercelResponse,
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): void {
  res.status(status)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (headers) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  }
  res.json(body)
}

export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim().slice(0, 128)
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0]!.trim().slice(0, 128)
  }
  const remote = req.socket?.remoteAddress
  return (remote ?? 'unknown').slice(0, 128)
}

export function requireStaffSession(
  req: VercelRequest,
):
  | { ok: true; session: StaffSessionPayload }
  | { ok: false; status: number; code: string; message: string } {
  const secret = staffSessionSecret()
  if (!secret || secret.length < 32) {
    return {
      ok: false,
      status: 500,
      code: 'misconfigured',
      message: 'Staff session is not configured.',
    }
  }
  const cookieHeader = req.headers.cookie
  const token = readCookie(
    typeof cookieHeader === 'string' ? cookieHeader : undefined,
    STAFF_SESSION_COOKIE,
  )
  const session = verifyStaffSessionToken(token, secret)
  if (!session) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'Staff session required or expired.',
    }
  }
  return { ok: true, session }
}

export function expiredSessionClearHeader(req: VercelRequest): Record<string, string> {
  return {
    'Set-Cookie': clearStaffSessionCookieHeader(isSecureCookieRequest(req)),
  }
}

export function readJsonBody<T extends Record<string, unknown>>(req: VercelRequest): T {
  const body = req.body
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as T
  if (typeof body === 'string' && body.trim()) {
    try {
      return JSON.parse(body) as T
    } catch {
      return {} as T
    }
  }
  return {} as T
}
