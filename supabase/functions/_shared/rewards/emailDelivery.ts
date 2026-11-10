/**
 * Final B — Resend (or demo log) transactional delivery.
 * Secrets: RESEND_API_KEY, TRANSACTIONAL_EMAIL_FROM — never VITE_*.
 * Provider HTTP acceptance ≠ final inbox delivery.
 *
 * Demo delivery config (default):
 * - Missing secrets OR non-redeemable/demo voucher → structured demo_log acceptance.
 * - Set VOUCHER_EMAIL_SEND_DEMO=true with secrets to actually send branded demo emails via Resend.
 */

import { buildVoucherEmail, type VoucherEmailTemplateInput } from './voucherEmailTemplate.ts'

export type DeliverVoucherEmailInput = VoucherEmailTemplateInput &
  Readonly<{
    toEmail: string
  }>

export type EmailDeliveryResult =
  | Readonly<{ ok: true; provider: string; messageId: string; demoLogged: boolean }>
  | Readonly<{ ok: false; provider: string; error: string; demoLogged: boolean }>

function env(name: string): string | null {
  const value = Deno.env.get(name)
  return value && value.trim().length > 0 ? value.trim() : null
}

export function getTransactionalEmailConfig(): {
  apiKey: string | null
  from: string | null
  sendDemoViaProvider: boolean
} {
  const flag = env('VOUCHER_EMAIL_SEND_DEMO')
  return {
    apiKey: env('RESEND_API_KEY'),
    from: env('TRANSACTIONAL_EMAIL_FROM'),
    sendDemoViaProvider: flag === '1' || flag === 'true',
  }
}

async function sendViaResend(input: {
  apiKey: string
  from: string
  toEmail: string
  subject: string
  html: string
  text: string
}): Promise<EmailDeliveryResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
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

function demoLogAccept(subject: string, voucherCode: string): EmailDeliveryResult {
  console.info(
    JSON.stringify({
      type: 'voucher_email_demo_log',
      subject,
      voucherCodePrefix: voucherCode.slice(0, 8),
      demo: true,
      redeemable: false,
    }),
  )
  return {
    ok: true,
    provider: 'demo_log',
    messageId: `demo_${crypto.randomUUID()}`,
    demoLogged: true,
  }
}

export async function deliverVoucherEmail(
  input: DeliverVoucherEmailInput,
): Promise<EmailDeliveryResult> {
  const content = buildVoucherEmail(input)
  const cfg = getTransactionalEmailConfig()
  const isDemoVoucher = input.demo || !input.redeemable

  if (!cfg.apiKey || !cfg.from) {
    return demoLogAccept(content.subject, input.voucherCode)
  }

  if (isDemoVoucher && !cfg.sendDemoViaProvider) {
    return demoLogAccept(content.subject, input.voucherCode)
  }

  return sendViaResend({
    apiKey: cfg.apiKey,
    from: cfg.from,
    toEmail: input.toEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
  })
}
