import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyStaffPassword } from '../../shared/staff/staffPassword'
import {
  STAFF_SESSION_TTL_SECONDS,
  createStaffSessionToken,
  staffSessionCookieHeader,
} from '../../shared/staff/staffSession'
import {
  isSecureCookieRequest,
  staffPasswordHash,
  staffSessionSecret,
} from '../_lib/env'
import { clientIp, json, readJsonBody } from '../_lib/http'
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from '../_lib/rateLimit'
import { getServiceClient } from '../_lib/supabaseAdmin'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, code: 'method_not_allowed', message: 'POST only.' })
    return
  }

  const passwordHash = staffPasswordHash()
  const sessionSecret = staffSessionSecret()
  if (!passwordHash || !sessionSecret || sessionSecret.length < 32) {
    json(res, 500, {
      ok: false,
      code: 'misconfigured',
      message: 'Staff authentication is not configured on the server.',
    })
    return
  }

  let admin
  try {
    admin = getServiceClient()
  } catch {
    json(res, 500, {
      ok: false,
      code: 'misconfigured',
      message: 'Staff authentication backend is not configured.',
    })
    return
  }

  const ip = clientIp(req)
  const limit = await assertLoginAllowed(admin, ip)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    json(res, 429, {
      ok: false,
      code: 'rate_limited',
      message: 'Too many password attempts. Try again later.',
      retryAfterSeconds: limit.retryAfterSeconds,
    })
    return
  }

  const body = readJsonBody<{ password?: unknown }>(req)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!password || password.length > 256) {
    await recordLoginFailure(admin, ip)
    json(res, 401, { ok: false, code: 'invalid_password', message: 'Incorrect password.' })
    return
  }

  const valid = verifyStaffPassword(password, passwordHash)
  if (!valid) {
    await recordLoginFailure(admin, ip)
    json(res, 401, { ok: false, code: 'invalid_password', message: 'Incorrect password.' })
    return
  }

  await clearLoginFailures(admin, ip)
  const { token, payload } = createStaffSessionToken(sessionSecret)
  const secure = isSecureCookieRequest(req)
  json(
    res,
    200,
    {
      ok: true,
      authenticated: true,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    },
    {
      'Set-Cookie': staffSessionCookieHeader(token, {
        maxAgeSeconds: STAFF_SESSION_TTL_SECONDS,
        secure,
      }),
    },
  )
}
