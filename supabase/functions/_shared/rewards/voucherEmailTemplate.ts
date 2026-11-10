/**
 * Final B — branded transactional voucher email (HTML + text).
 * Demo mode copy never promises a redeemable live discount.
 */

export type VoucherEmailTemplateInput = Readonly<{
  fullName: string
  amountCents: number
  voucherCode: string
  expiresAtIso: string
  demo: boolean
  redeemable: boolean
  termsVersion: string
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

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function buildVoucherEmail(input: VoucherEmailTemplateInput): VoucherEmailContent {
  const amount = formatAud(input.amountCents)
  const expires = formatExpiry(input.expiresAtIso)
  const contactEmail = input.contactEmail ?? 'hello@decarbysolar.com.au'
  const contactPhone = input.contactPhone ?? 'Contact Decarby Solar'

  const demoBanner = input.demo || !input.redeemable
    ? 'DEMO / NON-REDEEMABLE: This message exercises the delivery workflow only. No redeemable promotional discount has been issued.'
    : null

  const subject = demoBanner
    ? `[Demo] Decarby Solar Roof Challenge — voucher workflow (${amount})`
    : `Your Decarby Solar Roof Challenge voucher — ${amount} OFF`

  const congrats = demoBanner
    ? `Thanks ${input.fullName} — your demo voucher request was processed.`
    : `Congratulations ${input.fullName}! Your promotional voucher is ready.`

  const text = [
    'Decarby Solar Roof Challenge',
    '',
    congrats,
    demoBanner ?? '',
    '',
    `Discount amount: ${amount}`,
    `Voucher code: ${input.voucherCode}`,
    `Expires: ${expires}`,
    '',
    'Redemption instructions:',
    input.redeemable
      ? 'Present this code when arranging an eligible Decarby Solar installation quotation. Staff will verify validity, expiry and terms.'
      : 'This demo code cannot be redeemed for a discount. Real issuance requires Decarby campaign approval.',
    '',
    `Promotional terms version: ${input.termsVersion}`,
    'Full terms apply. Offer subject to eligibility, availability and Decarby approval.',
    '',
    `Contact: ${contactEmail} | ${contactPhone}`,
    '',
    '© Decarby Solar',
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Decarby Solar Voucher</title></head>
<body style="margin:0;padding:0;background:#f3f7fa;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#16384a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fa;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d7e3ea;">
        <tr><td style="background:linear-gradient(135deg,#1f6f8b,#2b8fc9);padding:28px 32px;color:#fff;">
          <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">Decarby Solar</div>
          <div style="font-size:26px;font-weight:800;margin-top:6px;">Roof Challenge</div>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          ${demoBanner ? `<p style="background:#fff4d6;border:1px solid #f0c24b;border-radius:10px;padding:12px 14px;font-weight:700;">${demoBanner}</p>` : ''}
          <p style="font-size:18px;font-weight:700;margin:0 0 12px;">${congrats}</p>
          <p style="margin:0 0 18px;line-height:1.5;">Thank you for completing the five-rooftop Classic campaign.</p>
          <table role="presentation" width="100%" style="background:#f7fbfd;border-radius:12px;padding:8px;">
            <tr><td style="padding:10px 14px;"><strong>Discount</strong><br/>${amount}</td></tr>
            <tr><td style="padding:10px 14px;"><strong>Voucher code</strong><br/><span style="font-size:20px;letter-spacing:0.06em;font-weight:800;">${input.voucherCode}</span></td></tr>
            <tr><td style="padding:10px 14px;"><strong>Expires</strong><br/>${expires}</td></tr>
          </table>
          <h2 style="font-size:16px;margin:22px 0 8px;">Redemption instructions</h2>
          <p style="margin:0;line-height:1.5;">${
            input.redeemable
              ? 'Present this code when arranging an eligible Decarby Solar installation quotation. Our team will verify validity, expiry and promotional terms.'
              : 'This demo code cannot be redeemed. Live promotional discounts require explicit Decarby campaign approval and activation.'
          }</p>
          <h2 style="font-size:16px;margin:22px 0 8px;">Terms</h2>
          <p style="margin:0;line-height:1.5;color:#4d6673;">Promotional terms version <strong>${input.termsVersion}</strong>. Offer subject to eligibility, availability and Decarby approval. Not transferable for cash.</p>
          <p style="margin:22px 0 0;line-height:1.5;color:#4d6673;">Contact: ${contactEmail}<br/>${contactPhone}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}
