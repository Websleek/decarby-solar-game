import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateCampaignReward } from '../../../shared/campaign/rewardTiers'
import { requestPromotionalClaim } from './promotionalRewards'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260326000000_final_a_campaign_runs.sql',
)

describe('Final A campaign-run security contract', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('adds campaign run tables with RLS and service-role writes only', () => {
    expect(sql).toContain('create table if not exists public.promotional_campaign_runs')
    expect(sql).toContain('create table if not exists public.promotional_campaign_run_levels')
    expect(sql).toContain('create table if not exists public.promotional_campaign_reward_decisions')
    expect(sql).toContain('alter table public.promotional_campaign_runs enable row level security')
    expect(sql).toContain('promotional_campaign_runs_select_own')
    expect(sql).toContain(
      'revoke all on table public.promotional_campaign_runs from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant insert, update, delete on table public.promotional_campaign_runs to service_role',
    )
    expect(sql).toContain('voucher_issued boolean not null default false')
    expect(sql).toContain('voucher_issued = false')
  })

  it('associates attempts via nullable campaign_run_id without rewriting verified scores', () => {
    expect(sql).toContain('add column if not exists campaign_run_id uuid')
    expect(sql).toContain('references public.promotional_campaign_runs')
  })

  it('keeps public claim path disabled and reward decisions non-issued', () => {
    expect(() => requestPromotionalClaim()).toThrow(/disabled/i)
    expect(sql).toContain('promotional_campaign_reward_decisions are immutable')
    expect(sql).not.toMatch(/claims_enabled\s*=\s*true/i)
  })
})

describe('Final A reward calculator authority', () => {
  it('does not invent eligibility from empty inputs', () => {
    const decision = evaluateCampaignReward([])
    expect(decision.eligible).toBe(false)
  })
})
