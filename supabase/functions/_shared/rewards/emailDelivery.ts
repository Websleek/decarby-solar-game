/**
 * Resend (or demo log) transactional delivery.
 * Secrets: RESEND_API_KEY, TRANSACTIONAL_EMAIL_FROM — never VITE_*.
 * Test sends: VOUCHER_EMAIL_SEND_DEMO + VOUCHER_EMAIL_TEST_ALLOWLIST (fail-closed).
 * Provider HTTP acceptance ≠ final inbox delivery.
 */

import { buildVoucherEmail, type VoucherEmailTemplateInput } from './voucherEmailTemplate.ts'
import {
  canSendDemoEmailViaProvider,
  parseEmailAllowlist,
} from './emailTestAllowlist.ts'

export type DeliverVoucherEmailInput = VoucherEmailTemplateInput &
  Readonly<{
    toEmail: string
    /** Stable id for Resend Idempotency-Key — use email job UUID. */
    emailJobId?: string
  }>

export type EmailDeliveryResult =
  | Readonly<{
      ok: true
      provider: 'demo_log' | 'resend'
      messageId: string
      demoLogged: boolean
      reason?: string
    }>
  | Readonly<{
      ok: false
      provider: 'demo_log' | 'resend'
      error: string
      demoLogged: boolean
    }>

function env(name: string): string | null {
  const value = Deno.env.get(name)
  return value && value.trim().length > 0 ? value.trim() : null
}

export function getTransactionalEmailConfig(): {
  apiKey: string | null
  from: string | null
  sendDemoViaProvider: boolean
  testAllowlist: readonly string[]
} {
  const flag = env('VOUCHER_EMAIL_SEND_DEMO')
  return {
    apiKey: env('RESEND_API_KEY'),
    from: env('TRANSACTIONAL_EMAIL_FROM'),
    sendDemoViaProvider: flag === '1' || flag === 'true',
    testAllowlist: parseEmailAllowlist(env('VOUCHER_EMAIL_TEST_ALLOWLIST')),
  }
}

export { canSendDemoEmailViaProvider } from './emailTestAllowlist.ts'

async function sendViaResend(input: {
  apiKey: string
  from: string
  toEmail: string
  subject: string
  html: string
  text: string
  emailJobId?: string
}): Promise<EmailDeliveryResult> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (input.emailJobId && input.emailJobId.length >= 8) {
      // Resend Idempotency-Key: retries with the same job id should not create duplicates.
      headers['Idempotency-Key'] = `voucher-email-job:${input.emailJobId}`
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: input.from,
        to: [input.toEmail],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!response.ok) {
      return {
        ok: false,
        provider: 'resend',
        error: payload.message ?? `resend_http_${response.status}`,
        demoLogged: false,
      }
    }
    return {
      ok: true,
      provider: 'resend',
      messageId: typeof payload.id === 'string' ? payload.id : `resend_${crypto.randomUUID()}`,
      demoLogged: false,
    }
  } catch (error) {
    return {
      ok: false,
      provider: 'resend',
      error: error instanceof Error ? error.message : 'resend_network_error',
      demoLogged: false,
    }
  }
}

function demoLogAccept(
  subject: string,
  voucherCode: string,
  reason: string,
): EmailDeliveryResult {
  console.info(
    JSON.stringify({
      type: 'voucher_email_demo_log',
      subject,
      voucherCodePrefix: voucherCode.slice(0, 8),
      demo: true,
      redeemable: false,
      reason,
    }),
  )
  return {
    ok: true,
    provider: 'demo_log',
    messageId: `demo_${crypto.randomUUID()}`,
    demoLogged: true,
    reason,
  }
}

export async function deliverVoucherEmail(
  input: DeliverVoucherEmailInput,
): Promise<EmailDeliveryResult> {
  const content = buildVoucherEmail(input)
  const cfg = getTransactionalEmailConfig()

  if (!cfg.apiKey || !cfg.from) {
    return demoLogAccept(content.subject, input.voucherCode, 'missing_resend_secrets')
  }

  const gate = canSendDemoEmailViaProvider({
    toEmail: input.toEmail,
    demo: input.demo,
    redeemable: input.redeemable,
    sendDemoViaProvider: cfg.sendDemoViaProvider,
    testAllowlist: cfg.testAllowlist,
  })

  if (!gate.allowed) {
    return demoLogAccept(content.subject, input.voucherCode, gate.reason)
  }

  // Live redeemable path still requires explicit approved issuance upstream.
  if (input.redeemable === true && input.demo === false && !cfg.sendDemoViaProvider) {
    // Live path uses Resend when secrets exist; demo flag is unrelated.
  }

  return sendViaResend({
    apiKey: cfg.apiKey,
    from: cfg.from,
    toEmail: input.toEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    emailJobId: input.emailJobId,
  })
}
