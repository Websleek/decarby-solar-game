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

  const body = readJsonBody<{ code?: unknown; confirm?: unknown }>(req)
  if (body.confirm !== true) {
    json(res, 400, {
      ok: false,
      code: 'confirmation_required',
      message: 'Confirm redemption before continuing.',
    })
    return
  }

  const normalized = normalizeVoucherCode(typeof body.code === 'string' ? body.code : '')
  if (!normalized) {
    json(res, 400, {
      ok: false,
      code: 'invalid_code',
      message: 'Enter a valid voucher code.',
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

  const { data, error } = await admin.rpc('staff_redeem_promotional_voucher', {
    p_code_normalized: normalized,
    p_actor_session_jti: auth.session.jti,
  })
  if (error) {
    console.error('staff redeem failed', error.message)
    json(res, 500, { ok: false, code: 'server_error', message: 'Could not redeem voucher.' })
    return
  }

  const payload = (data ?? {}) as Record<string, unknown>
  const voucher = mapVoucherRow(payload.voucher as Record<string, unknown>)
  const mapped = voucher ? withUiStatus(voucher) : null

  if (payload.ok === true) {
    json(res, 200, {
      ok: true,
      code: 'redeemed',
      message: String(payload.message ?? 'Voucher redeemed successfully.'),
      voucher: mapped,
    })
    return
  }

  const errCode = String(payload.code ?? 'redeem_failed')
  const status =
    errCode === 'not_found'
      ? 404
      : errCode === 'already_redeemed' ||
          errCode === 'expired' ||
          errCode === 'void' ||
          errCode === 'not_redeemable' ||
          errCode === 'issuance_not_live'
        ? 409
        : 400

  json(res, status, {
    ok: false,
    code: errCode,
    message: String(payload.message ?? 'Redemption failed.'),
    voucher: mapped,
  })
}
