import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createPromotionalClaimTestHarness,
  promotionalRewardService,
  requestPromotionalClaim,
} from './promotionalRewards'

const phase4c1Path = resolve(
  process.cwd(),
  'supabase/migrations/20260324000000_phase4c1_promotional_rewards.sql',
)
const phase4c2Path = resolve(
  process.cwd(),
  'supabase/migrations/20260324120000_phase4c2_claim_workflow.sql',
)

describe('phase 4C.2 claim workflow SQL security contract', () => {
  const sql = readFileSync(phase4c2Path, 'utf8')
  const foundation = readFileSync(phase4c1Path, 'utf8')

  it('adds service_role-only claim RPCs without anon/authenticated execute', () => {
    expect(sql).toContain('create or replace function public.request_player_reward_claim')
    expect(sql).toContain('create or replace function public.transition_player_reward_claim')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.request_player_reward_claim(\n  uuid, uuid, boolean, boolean, jsonb, text\n) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.request_player_reward_claim(\n  uuid, uuid, boolean, boolean, jsonb, text\n) to service_role',
    )
    expect(sql).toContain(
      'revoke all on function public.transition_player_reward_claim(\n  uuid, public.reward_claim_status, text, text\n) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.transition_player_reward_claim(\n  uuid, public.reward_claim_status, text, text\n) to service_role',
    )
    expect(sql).not.toMatch(
      /grant execute on function public\.request_player_reward_claim\([^)]+\)\s+to anon/i,
    )
    expect(sql).not.toMatch(
      /grant execute on function public\.request_player_reward_claim\([^)]+\)\s+to authenticated/i,
    )
  })

  it('fail-closes on claims_enabled, adult/consent, and never issues vouchers', () => {
    expect(sql).toContain("v_reward.claims_enabled is distinct from true")
    expect(sql).toContain('adult_verification_required')
    expect(sql).toContain('consent_required')
    expect(sql).toContain("'voucherIssued', false")
    expect(sql).toContain("'redeemable', false")
    expect(sql).toContain("'monetaryValueIssued', false")
    expect(sql).not.toMatch(/voucher_code/i)
    expect(sql).not.toMatch(/discount_code/i)
  })

  it('enforces explicit transitions and unique conflict retry safety', () => {
    expect(sql).toContain('reward_claim_transition_allowed')
    expect(sql).toContain("p_from = 'pending' and p_to in ('approved', 'rejected', 'cancelled', 'expired')")
    expect(sql).toContain('unique_violation')
    expect(sql).toContain('for update')
  })

  it('preserves phase 4C.1 RLS mutation boundaries and inactive demos', () => {
    expect(foundation).toContain(
      'revoke all on table public.player_reward_claims from public, anon, authenticated',
    )
    expect(foundation).toContain(
      'grant insert, update, delete on table public.player_reward_claims to service_role',
    )
    expect(foundation).toContain('claims_enabled boolean not null default false')
    expect(sql).not.toContain('alter table public.player_reward_claims disable row level security')
    expect(sql).not.toMatch(/grant insert on table public\.player_reward_claims to (anon|authenticated)/i)
  })
})

describe('phase 4C.2 public API remains disabled', () => {
  it('keeps the public claim path disabled while exposing an internal harness', () => {
    expect(() => requestPromotionalClaim()).toThrow(/Public promotional reward claims are disabled/i)
    expect(() => promotionalRewardService.requestPromotionalClaim()).toThrow(/disabled/i)

    const harness = createPromotionalClaimTestHarness({ internalClaimsAllowed: true })
    expect(harness.listAudits()).toEqual([])
  })

  it('does not enable production demo claims', () => {
    expect(
      promotionalRewardService.listInactiveDemoRewards().every((r) => r.claimsEnabled === false),
    ).toBe(true)
    expect(promotionalRewardService.getInactiveDemoCampaign().lifecycleStatus).toBe('draft')
  })
})
