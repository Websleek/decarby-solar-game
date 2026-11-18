import type { VercelRequest, VercelResponse } from '@vercel/node'
import { expiredSessionClearHeader, json, requireStaffSession } from '../_lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    json(res, 405, { ok: false, code: 'method_not_allowed', message: 'GET only.' })
    return
  }
  const auth = requireStaffSession(req)
  if (!auth.ok) {
    json(
      res,
      auth.status,
      { ok: false, authenticated: false, code: auth.code, message: auth.message },
      auth.status === 401 ? expiredSessionClearHeader(req) : undefined,
    )
    return
  }
  json(res, 200, {
    ok: true,
    authenticated: true,
    expiresAt: new Date(auth.session.exp * 1000).toISOString(),
  })
}
