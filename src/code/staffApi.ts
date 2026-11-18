import type { StaffVoucherView } from '../../shared/staff/redeemEligibility'

export type StaffVoucherResult = StaffVoucherView & {
  displayStatus: string
  canRedeem: boolean
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function fetchStaffSession(): Promise<{ authenticated: boolean; expiresAt?: string }> {
  const res = await fetch('/api/staff/session', {
    method: 'GET',
    credentials: 'same-origin',
  })
  const body = await parseJson(res)
  return {
    authenticated: res.ok && body.authenticated === true,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
  }
}

export async function staffLogin(password: string): Promise<{
  ok: boolean
  code?: string
  message?: string
  expiresAt?: string
}> {
  const res = await fetch('/api/staff/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const body = await parseJson(res)
  return {
    ok: res.ok && body.ok === true,
    code: typeof body.code === 'string' ? body.code : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
  }
}

export async function staffLogout(): Promise<void> {
  await fetch('/api/staff/logout', {
    method: 'POST',
    credentials: 'same-origin',
  })
}

export async function staffLookup(code: string): Promise<{
  ok: boolean
  code?: string
  message?: string
  voucher?: StaffVoucherResult
}> {
  const res = await fetch('/api/staff/lookup', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = await parseJson(res)
  if (!res.ok || body.ok !== true) {
    return {
      ok: false,
      code: typeof body.code === 'string' ? body.code : 'lookup_failed',
      message: typeof body.message === 'string' ? body.message : 'Lookup failed.',
    }
  }
  return {
    ok: true,
    voucher: body.voucher as StaffVoucherResult,
  }
}

export async function staffRedeem(code: string): Promise<{
  ok: boolean
  code?: string
  message?: string
  voucher?: StaffVoucherResult
}> {
  const res = await fetch('/api/staff/redeem', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, confirm: true }),
  })
  const body = await parseJson(res)
  return {
    ok: res.ok && body.ok === true,
    code: typeof body.code === 'string' ? body.code : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
    voucher: body.voucher as StaffVoucherResult | undefined,
  }
}
