import type { VercelRequest, VercelResponse } from '@vercel/node'
import { normalizeVoucherCode } from '../../shared/staff/normalizeVoucherCode'
import {
  expiredSessionClearHeader,
  json,
  readJsonBody,
  requireStaffSession,
} from '../_lib/http'
import { getServiceClient } from '../_lib/supabaseAdmin'
import { mapVoucherRow, withUiStatus } from '../_lib/voucherMap'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, code: 'method_not_allowed', message: 'POST only.' })
    return
  }

  const auth = requireStaffSession(req)
  if (!auth.ok) {
    json(
      res,
      auth.status,
      { ok: false, code: auth.code, message: auth.message },
      auth.status === 401 ? expiredSessionClearHeader(req) : undefined,
    )
    return
  }

  const body = readJsonBody<{ code?: unknown }>(req)
  const normalized = normalizeVoucherCode(typeof body.code === 'string' ? body.code : '')
  if (!normalized) {
    json(res, 400, {
      ok: false,
      code: 'invalid_code',
      message: 'Enter a valid voucher code.',
      exists: false,
    })
    return
  }

  let admin
  try {
    admin = getServiceClient()
  } catch {
    json(res, 500, { ok: false, code: 'misconfigured', message: 'Database is not configured.' })
    return
  }

  const { data, error } = await admin.rpc('staff_lookup_promotional_voucher', {
    p_code_normalized: normalized,
  })
  if (error) {
    console.error('staff lookup failed', error.message)
    json(res, 500, { ok: false, code: 'server_error', message: 'Could not look up voucher.' })
    return
  }

  const payload = (data ?? {}) as Record<string, unknown>
  if (payload.ok !== true) {
    json(res, 404, {
      ok: false,
      code: String(payload.code ?? 'not_found'),
      message: String(payload.message ?? 'No voucher matches that code.'),
      exists: false,
    })
    return
  }

  const voucher = mapVoucherRow(payload.voucher as Record<string, unknown>)
  if (!voucher) {
    json(res, 404, {
      ok: false,
      code: 'not_found',
      message: 'No voucher matches that code.',
      exists: false,
    })
    return
  }

  json(res, 200, {
    ok: true,
    exists: true,
    voucher: withUiStatus(voucher),
  })
}
