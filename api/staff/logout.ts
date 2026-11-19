import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isSecureCookieRequest } from '../_lib/env'
import { withStaffApiHandler } from '../_lib/handler'
import { json } from '../_lib/http'
import { clearStaffSessionCookieHeader } from '../_lib/session'

async function logoutHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, code: 'method_not_allowed', message: 'POST only.' })
    return
  }
  json(
    res,
    200,
    { ok: true, authenticated: false },
    { 'Set-Cookie': clearStaffSessionCookieHeader(isSecureCookieRequest(req)) },
  )
}

export default withStaffApiHandler('logout', logoutHandler)
