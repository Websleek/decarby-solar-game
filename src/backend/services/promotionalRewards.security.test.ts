import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  evaluateDemoPromotionalEligibility,
  promotionalRewardService,
  requestPromotionalClaim,
} from './promotionalRewards'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260324000000_phase4c1_promotional_rewards.sql',
)

describe('phase 4C.1 promotional rewards security contract', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('creates the four foundation tables with RLS enabled', () => {
    expect(sql).toContain('create table if not exists public.reward_campaigns')
    expect(sql).toContain('create table if not exists public.reward_definitions')
    expect(sql).toContain('create table if not exists public.player_reward_claims')
    expect(sql).toContain('create table if not exists public.reward_audit_events')
    expect(sql).toContain('alter table public.reward_campaigns enable row level security')
    expect(sql).toContain('alter table public.reward_definitions enable row level security')
    expect(sql).toContain('alter table public.player_reward_claims enable row level security')
    expect(sql).toContain('alter table public.reward_audit_events enable row level security')
  })

  it('restricts public catalog reads and keeps mutations service_role-only', () => {
    expect(sql).toContain('reward_campaigns_select_public_active')
    expect(sql).toContain('reward_definitions_select_public_published')
    expect(sql).toContain(
      'revoke all on table public.reward_campaigns from public, anon, authenticated',
    )
    expect(sql).toContain(
      'revoke all on table public.reward_definitions from public, anon, authenticated',
    )
    expect(sql).toContain(
      'revoke all on table public.player_reward_claims from public, anon, authenticated',
    )
    expect(sql).toContain(
      'revoke all on table public.reward_audit_events from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant insert, update, delete on table public.reward_campaigns to service_role',
    )
    expect(sql).toContain(
      'grant insert, update, delete on table public.reward_definitions to service_role',
    )
    expect(sql).toContain(
      'grant insert, update, delete on table public.player_reward_claims to service_role',
    )
    expect(sql).toContain('grant insert on table public.reward_audit_events to service_role')
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)\s+on\s+table\s+public\.reward_campaigns\s+to\s+(anon|authenticated)/i,
    )
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)\s+on\s+table\s+public\.player_reward_claims\s+to\s+(anon|authenticated)/i,
    )
  })

  it('scopes claim reads to authenticated owner and denies client audit reads', () => {
    expect(sql).toContain('player_reward_claims_select_own')
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).toContain('grant select on table public.reward_audit_events to service_role')
    expect(sql).not.toMatch(
      /grant select on table public\.reward_audit_events to (anon|authenticated)/i,
    )
  })

  it('enforces one claim per player/reward and immutable audit events', () => {
    expect(sql).toContain(
      'constraint player_reward_claims_player_reward_uidx unique (player_id, reward_id)',
    )
    expect(sql).toContain('reward_audit_events are immutable')
    expect(sql).toContain('reward_audit_events_no_update')
    expect(sql).toContain('reward_audit_events_no_delete')
  })

  it('seeds inactive non-redeemable demo rewards only', () => {
    expect(sql).toContain('phase4c1-dev-placeholders')
    expect(sql).toContain('solar-starter-consultation')
    expect(sql).toContain('star-collector-example-100')
    expect(sql).toContain('solar-champion-example-250')
    expect(sql).toContain('solar-legend-example-500')
    expect(sql).toContain("'draft'")
    expect(sql).toContain('approvedCustomerOffer')
    expect(sql).not.toMatch(/create or replace function public\.claim_/i)
    expect(sql).not.toMatch(/grant execute on function public\.claim_/i)
  })

  it('does not introduce a public claim endpoint or SECURITY DEFINER claim helper', () => {
    expect(sql).not.toMatch(/security definer[\s\S]{0,200}claim/i)
    expect(sql).not.toContain('create or replace function public.request_reward_claim')
  })
})

describe('phase 4C.1 promotional reward service foundation', () => {
  it('keeps demo rewards unavailable and never invents discounts during eligibility', () => {
    const views = evaluateDemoPromotionalEligibility({
      verifiedAchievementIds: ['solar_starter', 'solar_champion', 'solar_legend'],
      verifiedStarsByLevel: {
        'sunny-house': 3,
        'chimney-challenge': 3,
        'tricky-rooftop': 3,
        'solar-puzzle-master': 3,
        'decarby-solar-champion': 3,
      },
      verifiedCompletedRooftops: [
        'sunny-house',
        'chimney-challenge',
        'tricky-rooftop',
        'solar-puzzle-master',
        'decarby-solar-champion',
      ],
      finalisedLeaderboardStandings: [{ board: 'overall', rank: 1, finalised: true }],
    })
    expect(views.length).toBe(4)
    for (const view of views) {
      expect(view.result.eligible).toBe(false)
      expect(view.result.status).toBe('unavailable')
      expect(view).not.toHaveProperty('claim')
      expect(view).not.toHaveProperty('voucherCode')
      expect(view.reward.claimsEnabled).toBe(false)
    }
  })

  it('refuses claim requests while Phase 4C.1 claims remain disabled', () => {
    expect(() => requestPromotionalClaim()).toThrow(/disabled in Phase 4C\.1/i)
    expect(() => promotionalRewardService.requestPromotionalClaim()).toThrow(/disabled/i)
  })

  it('lists inactive demo campaign without exposing live redemption state', () => {
    const campaign = promotionalRewardService.getInactiveDemoCampaign()
    expect(campaign.lifecycleStatus).toBe('draft')
    expect(campaign.publicCatalog).toBe(false)
    expect(promotionalRewardService.listInactiveDemoRewards().every((r) => !r.claimsEnabled)).toBe(
      true,
    )
  })
})
