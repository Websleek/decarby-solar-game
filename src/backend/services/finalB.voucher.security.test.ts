import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { competitiveLeaderboardService } from './leaderboard'
import { requestPromotionalClaim } from './promotionalRewards'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260327000000_final_b_voucher_claims.sql',
)
const claimFnPath = resolve(
  process.cwd(),
  'supabase/functions/claim-campaign-voucher/index.ts',
)
const resendFnPath = resolve(
  process.cwd(),
  'supabase/functions/resend-campaign-voucher-email/index.ts',
)
const emailDeliveryPath = resolve(
  process.cwd(),
  'supabase/functions/_shared/rewards/emailDelivery.ts',
)

describe('Final B voucher security contract', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const claimSrc = readFileSync(claimFnPath, 'utf8')
  const resendSrc = readFileSync(resendFnPath, 'utf8')
  const emailSrc = readFileSync(emailDeliveryPath, 'utf8')

  it('enforces unique email per campaign and unique voucher codes', () => {
    expect(sql).toContain('promotional_voucher_claims_email_campaign_uidx unique (campaign_id, email_normalized)')
    expect(sql).toContain('promotional_vouchers_code_uidx unique (code)')
    expect(sql).toContain('promotional_voucher_claims_run_uidx unique (run_id)')
    expect(sql).toContain('issue_campaign_voucher_claim')
  })

  it('keeps issuance service-role only with RLS and no anon grants', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain(
      'revoke all on table public.promotional_voucher_claims from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.issue_campaign_voucher_claim',
    )
    expect(sql).toContain('to service_role')
    expect(sql).not.toMatch(
      /grant execute on function public\.issue_campaign_voucher_claim[\s\S]{0,120}to (anon|authenticated)/i,
    )
  })

  it('does not activate 4C claims_enabled or live redeemable by default', () => {
    expect(sql).toContain("'demo'")
    expect(sql).toContain('real_redeemable')
    expect(sql).toContain('false')
    expect(sql).not.toMatch(/update\s+public\.reward_campaigns[\s\S]{0,80}claims_enabled\s*=\s*true/i)
    expect(sql).toContain('promotional_issuance_config_live_gate')
  })

  it('ignores client amount tampering and requires auth in Edge claim', () => {
    expect(claimSrc).toContain('void body.amountCents')
    expect(claimSrc).toContain('requireAuthenticatedUser')
    expect(claimSrc).toContain('issue_campaign_voucher_claim')
    expect(claimSrc).toContain('generateVoucherCode')
    expect(claimSrc).not.toContain('VITE_')
  })

  it('retries email without minting a second voucher', () => {
    expect(resendSrc).toContain('mark_voucher_email_job_result')
    expect(resendSrc).toContain('Does not issue a second voucher')
    expect(resendSrc).not.toContain('generateVoucherCode')
    expect(emailSrc).toContain('RESEND_API_KEY')
    expect(emailSrc).toContain('TRANSACTIONAL_EMAIL_FROM')
    expect(emailSrc).toMatch(/never VITE_\*/)
    expect(emailSrc).not.toMatch(/Deno\.env\.get\(\s*['"]VITE_/)
  })

  it('keeps public 4C claim path disabled and leaderboard free of PII fields', async () => {
    expect(() => requestPromotionalClaim()).toThrow(/disabled/i)
    // Static contract: leaderboard service module must not select claim emails/phones.
    const leaderboardSrc = readFileSync(
      resolve(process.cwd(), 'src/backend/services/leaderboard.ts'),
      'utf8',
    )
    expect(leaderboardSrc.toLowerCase()).not.toContain('email_normalized')
    expect(leaderboardSrc.toLowerCase()).not.toContain('voucher_code')
    expect(typeof competitiveLeaderboardService.getOverall).toBe('function')
  })
})
