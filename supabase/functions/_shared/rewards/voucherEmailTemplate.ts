/**
 * Branded transactional voucher email (HTML + text).
 * Demo/test messages never promise a redeemable live discount.
 */

import { MAX_CAMPAIGN_STARS } from '../campaign/rewardTiers.ts'

export type VoucherEmailTemplateInput = Readonly<{
  fullName: string
  amountCents: number
  voucherCode: string
  expiresAtIso: string
  demo: boolean
  redeemable: boolean
  termsVersion: string
  totalStars?: number
  contactEmail?: string
  contactPhone?: string
}>

export type VoucherEmailContent = Readonly<{
  subject: string
  html: string
  text: string
}>

function formatAud(cents: number): string {
  return `A$${(cents / 100).toFixed(0)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatExpiry(iso: string, redeemable: boolean, demo: boolean): string | null {
  if (demo || !redeemable) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function buildVoucherEmail(input: VoucherEmailTemplateInput): VoucherEmailContent {
  const amount = formatAud(input.amountCents)
  const safeName = escapeHtml(input.fullName.trim())
  const safeCode = escapeHtml(input.voucherCode)
  const safeTerms = escapeHtml(input.termsVersion)
  const contactEmail = escapeHtml(input.contactEmail ?? 'hello@decarbysolar.com.au')
  const contactPhone = escapeHtml(input.contactPhone ?? 'Contact Decarby Solar via decarbysolar.com.au')
  const stars =
    typeof input.totalStars === 'number' && Number.isFinite(input.totalStars)
      ? Math.max(0, Math.min(MAX_CAMPAIGN_STARS, Math.floor(input.totalStars)))
      : null
  const expires = formatExpiry(input.expiresAtIso, input.redeemable, input.demo)
  const isDemo = input.demo || !input.redeemable

  const demoBanner = isDemo
    ? 'TEST / DEMO / NOT REDEEMABLE — This message validates email delivery only. No promotional discount has been issued and this code cannot be redeemed.'
    : null

  const subject = isDemo
    ? `[TEST / DEMO] Decarby Solar Roof Challenge — non-redeemable voucher (${amount})`
    : `Your Decarby Solar Roof Challenge voucher — ${amount} OFF`

  const congrats = isDemo
    ? `Thanks ${safeName} — your test voucher request was processed.`
    : `Congratulations ${safeName}! Your promotional voucher is ready.`

  const textLines = [
    'Decarby Solar Roof Challenge',
    '',
    congrats,
    demoBanner ?? '',
    '',
    'You completed the three-rooftop Solar Roof Challenge.',
    stars != null ? `Verified total stars: ${stars} / ${MAX_CAMPAIGN_STARS}` : '',
    `Awarded discount amount: ${amount}`,
    `Voucher code: ${input.voucherCode}`,
    expires ? `Expires: ${expires}` : isDemo ? 'Expiry: not applicable (non-redeemable demo code)' : '',
    '',
    isDemo ? 'Redemption:' : 'Redemption instructions:',
    isDemo
      ? 'This code is not redeemable. Do not present it as a live Decarby discount.'
      : 'Present this code when arranging an eligible Decarby Solar installation quotation. Staff will verify validity, expiry and approved terms.',
    '',
    `Terms reference: ${input.termsVersion}`,
    isDemo
      ? 'No approved live promotional terms are activated by this test message.'
      : 'Offer subject to eligibility, availability and Decarby approval. Not transferable for cash.',
    '',
    `Contact: ${input.contactEmail ?? 'hello@decarbysolar.com.au'} | ${input.contactPhone ?? 'decarbysolar.com.au'}`,
    '',
    '© Decarby Solar',
  ].filter((line) => line !== '')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Decarby Solar Voucher</title></head>
<body style="margin:0;padding:0;background:#F8F7FC;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#242039;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8F7FC;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E5E0EF;max-width:560px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#ED3363 0%,#C63BCF 48%,#6E3CE2 100%);padding:28px 32px;color:#fff;">
          <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.95;">Decarby Solar</div>
          <div style="font-size:26px;font-weight:800;margin-top:6px;">Roof Challenge</div>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          ${
            demoBanner
              ? `<p style="background:#F1EBFD;border:1px solid #E5E0EF;border-radius:10px;padding:12px 14px;font-weight:700;color:#242039;margin:0 0 16px;">${escapeHtml(demoBanner)}</p>`
              : ''
          }
          <h1 style="font-size:20px;font-weight:800;margin:0 0 12px;color:#242039;">${congrats}</h1>
          <p style="margin:0 0 18px;line-height:1.5;color:#625D71;">Thank you for completing the three-rooftop Solar Roof Challenge.</p>
          <table role="presentation" width="100%" style="background:#F8F7FC;border-radius:12px;border:1px solid #E5E0EF;">
            ${
              stars != null
                ? `<tr><td style="padding:10px 14px;"><strong style="color:#625D71;">Verified stars</strong><br/><span style="font-size:18px;font-weight:800;color:#242039;">${stars} / ${MAX_CAMPAIGN_STARS}</span></td></tr>`
                : ''
            }
            <tr><td style="padding:10px 14px;"><strong style="color:#625D71;">Awarded discount</strong><br/><span style="font-size:22px;font-weight:800;color:#ED3363;">${amount}</span></td></tr>
            <tr><td style="padding:10px 14px;"><strong style="color:#625D71;">Voucher code</strong><br/><span style="font-size:20px;letter-spacing:0.06em;font-weight:800;color:#6E3CE2;">${safeCode}</span></td></tr>
            <tr><td style="padding:10px 14px;"><strong style="color:#625D71;">Expiry</strong><br/>${
              expires
                ? escapeHtml(expires)
                : 'Not applicable — demo codes are not redeemable'
            }</td></tr>
          </table>
          <h2 style="font-size:16px;margin:22px 0 8px;color:#242039;">${isDemo ? 'About this code' : 'Redemption instructions'}</h2>
          <p style="margin:0;line-height:1.5;color:#625D71;">${
            isDemo
              ? 'This code is <strong>not redeemable</strong>. It does not unlock a live Decarby discount and should not be presented for redemption.'
              : 'Present this code when arranging an eligible Decarby Solar installation quotation. Our team will verify validity, expiry and approved promotional terms.'
          }</p>
          <h2 style="font-size:16px;margin:22px 0 8px;color:#242039;">Terms</h2>
          <p style="margin:0;line-height:1.5;color:#625D71;">Terms reference <strong>${safeTerms}</strong>. ${
            isDemo
              ? 'No approved live promotional offer is activated by this test message.'
              : 'Offer subject to eligibility, availability and Decarby approval. Not transferable for cash.'
          }</p>
          <p style="margin:22px 0 0;line-height:1.5;color:#625D71;">Contact: ${contactEmail}<br/>${contactPhone}<br/><a href="https://decarbysolar.com.au/" style="color:#6E3CE2;">decarbysolar.com.au</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html, text: textLines.join('\n') }
}
