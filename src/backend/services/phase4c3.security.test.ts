import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validatePromotionalConsentInput } from '../../../shared/rewards/consent'
import { approvalDoesNotIssueVoucher, assertNoVoucherIssuanceInPhase4C3 } from '../../../shared/rewards/voucherPrep'
import { planSnapshotFinalise } from '../../../shared/leaderboard/snapshots'
import { canTransitionClaim } from '../../../shared/rewards/claimTransitions'
import { requestPromotionalClaim } from './promotionalRewards'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260325000000_phase4c3_claim_operations.sql',
)
const phase4c2Path = resolve(
  process.cwd(),
  'supabase/migrations/20260324120000_phase4c2_claim_workflow.sql',
)

describe('phase 4C.3 security and operational contracts', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const c2 = readFileSync(phase4c2Path, 'utf8')

  it('adds staff operators with self-select only and service_role mutations', () => {
    expect(sql).toContain('create table if not exists public.staff_operators')
    expect(sql).toContain('staff_operators_select_self')
    expect(sql).toContain('user_id = auth.uid() and active = true')
    expect(sql).toContain(
      'revoke all on table public.staff_operators from public, anon, authenticated',
    )
    expect(sql).toContain('grant insert, update, delete on table public.staff_operators to service_role')
    expect(sql).not.toMatch(/grant insert on table public\.staff_operators to authenticated/i)
  })

  it('keeps claim mutation RPCs service_role-only and adds operator-gated review', () => {
    expect(sql).toContain('create or replace function public.operator_review_claim')
    expect(sql).toContain('is_active_staff_operator')
    expect(sql).toContain('operator_required')
    expect(sql).toContain(
      'revoke all on function public.request_player_reward_claim(uuid, uuid, boolean, boolean, jsonb, text)\n  from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.request_player_reward_claim(uuid, uuid, boolean, boolean, jsonb, text)\n  to service_role',
    )
    expect(c2).toContain('grant execute on function public.request_player_reward_claim')
  })

  it('scopes player claim history and consent to auth.uid ownership', () => {
    expect(sql).toContain('create or replace function public.list_my_reward_claims')
    expect(sql).toContain('where p.user_id = auth.uid()')
    expect(sql).toContain('create table if not exists public.player_promotional_consents')
    expect(sql).toContain('player_promotional_consents_select_own')
    expect(sql).toContain('self_attestation_unverified')
    expect(sql).toContain('not independently verified age proof')
  })

  it('finalises immutable leaderboard snapshots via service_role only', () => {
    expect(sql).toContain('create table if not exists public.leaderboard_snapshots')
    expect(sql).toContain('leaderboard_snapshots_idempotent_uidx')
    expect(sql).toContain('leaderboard_snapshots are immutable once finalised')
    expect(sql).toContain('create or replace function public.finalise_leaderboard_snapshot')
    expect(sql).toContain(
      'revoke all on function public.finalise_leaderboard_snapshot(\n  text, text, text, text, timestamptz, timestamptz, integer\n) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.finalise_leaderboard_snapshot(\n  text, text, text, text, timestamptz, timestamptz, integer\n) to service_role',
    )

    const snapFix = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260328000000_final_c_snapshot_atomicity.sql'),
      'utf8',
    )
    expect(snapFix).toContain('Empty incomplete snapshot')
    expect(snapFix).toContain('snapshot_incomplete_retry')
  })

  it('keeps voucher intents non-issued and reserves approval meaning', () => {
    expect(sql).toContain('create table if not exists public.reward_voucher_intents')
    expect(sql).toContain('code_issued = false')
    expect(sql).toContain("lifecycle_status = 'reserved'")
    expect(sql).not.toMatch(/grant .* on table public\.reward_voucher_intents to (anon|authenticated)/i)
    expect(approvalDoesNotIssueVoucher()).toEqual({
      reviewedApproved: true,
      voucherIssued: false,
      redeemed: false,
      paid: false,
    })
    expect(() => assertNoVoucherIssuanceInPhase4C3({ codeIssued: true })).toThrow(/disabled/)
  })

  it('keeps public claim creation disabled and invalid transitions blocked', () => {
    expect(() => requestPromotionalClaim()).toThrow(/disabled/i)
    expect(canTransitionClaim('pending', 'redeemed')).toBe(false)
    expect(canTransitionClaim('pending', 'approved')).toBe(true)
  })
})

describe('phase 4C.3 consent and snapshot pure rules', () => {
  it('requires adult attestation, terms acceptance and matching version', () => {
    expect(
      validatePromotionalConsentInput({
        adultSelfAttested: false,
        termsAccepted: true,
        termsVersion: 'promo-terms-v1',
      }).ok,
    ).toBe(false)
    expect(
      validatePromotionalConsentInput({
        adultSelfAttested: true,
        termsAccepted: false,
        termsVersion: 'promo-terms-v1',
      }).ok,
    ).toBe(false)
    expect(
      validatePromotionalConsentInput({
        adultSelfAttested: true,
        termsAccepted: true,
        termsVersion: 'wrong',
      }).ok,
    ).toBe(false)
    expect(
      validatePromotionalConsentInput({
        adultSelfAttested: true,
        termsAccepted: true,
        termsVersion: 'promo-terms-v1',
      }).ok,
    ).toBe(true)
  })

  it('plans idempotent snapshot finalisation and rejects bad boards', () => {
    expect(
      planSnapshotFinalise({
        board: 'overall',
        periodLabel: '2026-W45',
        sourceFingerprint: 'fp-overall-001',
        entryCount: 10,
        existingFingerprint: 'fp-overall-001',
      }).kind,
    ).toBe('existing')
    expect(
      planSnapshotFinalise({
        board: 'weekly',
        periodLabel: '2026-W45',
        sourceFingerprint: 'fp-overall-001',
        entryCount: 10,
        existingFingerprint: null,
      }).kind,
    ).toBe('rejected')
    expect(
      planSnapshotFinalise({
        board: 'overall',
        periodLabel: '2026-W45',
        sourceFingerprint: 'fp-overall-002',
        entryCount: 10,
        existingFingerprint: null,
      }).kind,
    ).toBe('create')
  })
})

describe('phase 4C.3 edge function contracts', () => {
  const listMyClaims = readFileSync(
    resolve(process.cwd(), 'supabase/functions/list-my-claims/index.ts'),
    'utf8',
  )
  const operatorClaims = readFileSync(
    resolve(process.cwd(), 'supabase/functions/operator-claims/index.ts'),
    'utf8',
  )
  const consentFn = readFileSync(
    resolve(process.cwd(), 'supabase/functions/record-promotional-consent/index.ts'),
    'utf8',
  )
  const snapshotFn = readFileSync(
    resolve(process.cwd(), 'supabase/functions/finalise-leaderboard-snapshot/index.ts'),
    'utf8',
  )

  it('requires JWT auth and rate limits player/operator endpoints', () => {
    expect(listMyClaims).toContain('requireAuthenticatedUser')
    expect(listMyClaims).toContain('rate_limited')
    expect(listMyClaims).toContain('publicClaimingEnabled: false')
    expect(listMyClaims).toContain('canRequestClaim: false')
    expect(operatorClaims).toContain('isStaffOperator')
    expect(operatorClaims).toContain('operator_required')
    expect(operatorClaims).toContain("decision !== 'approve'")
    expect(operatorClaims).toContain('canIssueVouchers: false')
    expect(consentFn).toContain('independentlyVerifiedAge: false')
    expect(snapshotFn).toContain('finalise_leaderboard_snapshot')
    expect(snapshotFn).toContain('isStaffOperator')
  })

  it('does not expose unrestricted service-role claim creation to clients', () => {
    expect(listMyClaims).not.toContain('request_player_reward_claim')
    expect(operatorClaims).not.toContain('request_player_reward_claim')
    expect(operatorClaims).toContain('operator_review_claim')
  })
})
