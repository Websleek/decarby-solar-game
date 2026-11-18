import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearStaffSessionCookieHeader } from '../../shared/staff/staffSession'
import { isSecureCookieRequest } from '../_lib/env'
import { json } from '../_lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
