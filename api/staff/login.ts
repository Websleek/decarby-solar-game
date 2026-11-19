import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  inspectStaffPasswordHash,
  verifyStaffPasswordDetailed,
} from '../_lib/password'
import {
  STAFF_SESSION_TTL_SECONDS,
  createStaffSessionToken,
  staffSessionCookieHeader,
} from '../_lib/session'
import {
  isSecureCookieRequest,
  staffPasswordHash,
  staffSessionSecret,
} from '../_lib/env'
import { withStaffApiHandler } from '../_lib/handler'
import { clientIp, json, readJsonBody } from '../_lib/http'
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from '../_lib/rateLimit'
import { getServiceClient } from '../_lib/supabaseAdmin'

function logLoginDiag(category: string, detail?: string): void {
  if (detail) {
    console.error(`staff_login:${category}`, detail)
    return
  }
  console.error(`staff_login:${category}`)
}

async function loginHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, code: 'method_not_allowed', message: 'POST only.' })
    return
  }

  const passwordHash = staffPasswordHash()
  const sessionSecret = staffSessionSecret()
  const hashInspection = inspectStaffPasswordHash(passwordHash)

  if (!sessionSecret || sessionSecret.length < 32) {
    logLoginDiag('misconfigured_session_secret')
    json(res, 500, {
      ok: false,
      code: 'misconfigured',
      message: 'Staff authentication is not configured on the server.',
    })
    return
  }

  if (!hashInspection.ok) {
    logLoginDiag(
      hashInspection.reason === 'missing'
        ? 'misconfigured_password_hash_missing'
        : 'misconfigured_password_hash_malformed',
    )
    json(res, 500, {
      ok: false,
      code: hashInspection.reason === 'missing' ? 'misconfigured' : 'invalid_hash_config',
      message:
        hashInspection.reason === 'missing'
          ? 'Staff authentication is not configured on the server.'
          : 'Staff password configuration is invalid. Ask an admin to re-set STAFF_PASSWORD_HASH.',
    })
    return
  }

  let admin
  try {
    admin = getServiceClient()
  } catch {
    logLoginDiag('misconfigured_supabase')
    json(res, 500, {
      ok: false,
      code: 'misconfigured',
      message: 'Staff authentication backend is not configured.',
    })
    return
  }

  const ip = clientIp(req)

  let limit
  try {
    limit = await assertLoginAllowed(admin, ip)
  } catch (error) {
    logLoginDiag('rate_limit_store_error', error instanceof Error ? error.name : 'unknown')
    json(res, 500, {
      ok: false,
      code: 'server_error',
      message: 'Could not complete sign-in right now. Try again shortly.',
    })
    return
  }

  if (!limit.ok) {
    logLoginDiag('rate_limited')
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
    try {
      await recordLoginFailure(admin, ip)
    } catch (error) {
      logLoginDiag('rate_limit_record_error', error instanceof Error ? error.name : 'unknown')
    }
    json(res, 401, { ok: false, code: 'invalid_password', message: 'Incorrect password.' })
    return
  }

  const verified = verifyStaffPasswordDetailed(password, passwordHash)
  if (!verified.ok) {
    if (verified.reason === 'malformed' || verified.reason === 'missing') {
      logLoginDiag('invalid_hash_config_at_verify')
      json(res, 500, {
        ok: false,
        code: 'invalid_hash_config',
        message:
          'Staff password configuration is invalid. Ask an admin to re-set STAFF_PASSWORD_HASH.',
      })
      return
    }

    try {
      await recordLoginFailure(admin, ip)
    } catch (error) {
      logLoginDiag('rate_limit_record_error', error instanceof Error ? error.name : 'unknown')
    }
    json(res, 401, { ok: false, code: 'invalid_password', message: 'Incorrect password.' })
    return
  }

  try {
    await clearLoginFailures(admin, ip)
  } catch (error) {
    logLoginDiag('rate_limit_clear_error', error instanceof Error ? error.name : 'unknown')
  }

  let token: string
  let payload: { exp: number }
  try {
    ;({ token, payload } = createStaffSessionToken(sessionSecret))
  } catch {
    logLoginDiag('session_issue_failed')
    json(res, 500, {
      ok: false,
      code: 'misconfigured',
      message: 'Staff authentication is not configured on the server.',
    })
    return
  }

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

export default withStaffApiHandler('login', loginHandler)
