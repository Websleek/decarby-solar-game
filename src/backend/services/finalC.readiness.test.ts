import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateCampaignReward, pickTierForStars } from '../../../shared/campaign/rewardTiers'
import { CAMPAIGN_LEVEL_IDS } from '../../../shared/achievements/registry'
import { DEMO_SEED_ISSUANCE, isRedeemableIssuance } from '../../../shared/rewards/issuanceConfig'
import { InMemoryEmailClaimLedger } from '../../../shared/rewards/voucherClaim'

const root = process.cwd()

function factsForStars(perLevel: number[]) {
  return CAMPAIGN_LEVEL_IDS.map((levelId, index) => ({
    levelId,
    verifiedStars: perLevel[index] ?? 0,
    verifiedScore: 1000 + index,
    verifiedRecordId: `rec-${index}`,
    levelVersion: 1,
  }))
}

describe('Final C readiness contracts', () => {
  it('covers all reward-tier boundaries', () => {
    expect(pickTierForStars(4)).toBeNull()
    expect(pickTierForStars(5)?.amountCents).toBe(5000)
    expect(pickTierForStars(9)?.amountCents).toBe(5000)
    expect(pickTierForStars(10)?.amountCents).toBe(10000)
    expect(pickTierForStars(12)?.amountCents).toBe(10000)
    expect(pickTierForStars(13)?.amountCents).toBe(25000)
    expect(pickTierForStars(14)?.amountCents).toBe(25000)
    expect(pickTierForStars(15)?.amountCents).toBe(50000)

    const fifteen = evaluateCampaignReward(factsForStars([3, 3, 3, 3, 3]))
    expect(fifteen.eligible && fifteen.amountCents).toBe(50000)
  })

  it('keeps five-level campaign integrity and rejects incomplete runs', () => {
    const incomplete = evaluateCampaignReward(
      CAMPAIGN_LEVEL_IDS.slice(0, 4).map((levelId, index) => ({
        levelId,
        verifiedStars: 3,
        verifiedScore: 1000 + index,
        verifiedRecordId: `rec-${index}`,
        levelVersion: 1,
      })),
    )
    expect(incomplete.eligible).toBe(false)
  })

  it('keeps demo issuance non-redeemable and duplicate email blocked', () => {
    expect(isRedeemableIssuance(DEMO_SEED_ISSUANCE)).toBe(false)
    const ledger = new InMemoryEmailClaimLedger()
    const first = ledger.tryReserve({
      campaignId: 'classic-five-rooftop-v1',
      emailNormalized: 'a@example.com',
      playerId: 'p1',
      runId: 'r1',
    })
    const dup = ledger.tryReserve({
      campaignId: 'classic-five-rooftop-v1',
      emailNormalized: 'a@example.com',
      playerId: 'p2',
      runId: 'r2',
    })
    expect(first.ok).toBe(true)
    expect(dup.ok).toBe(false)
  })

  it('documents pending migration chain and Final B independence from 4C.2 RPCs', () => {
    const migrations = readdirSync(resolve(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
    expect(migrations).toContain('20260324120000_phase4c2_claim_workflow.sql')
    expect(migrations).toContain('20260325000000_phase4c3_claim_operations.sql')
    expect(migrations).toContain('20260326000000_final_a_campaign_runs.sql')
    expect(migrations).toContain('20260327000000_final_b_voucher_claims.sql')
    expect(migrations).toContain('20260328000000_final_c_snapshot_atomicity.sql')

    const finalB = readFileSync(
      resolve(root, 'supabase/migrations/20260327000000_final_b_voucher_claims.sql'),
      'utf8',
    )
    expect(finalB).not.toContain('transition_player_reward_claim')
    expect(finalB).toContain('real_redeemable boolean not null default false')

    const phase4c3 = readFileSync(
      resolve(root, 'supabase/migrations/20260325000000_phase4c3_claim_operations.sql'),
      'utf8',
    )
    expect(phase4c3).toContain('leaderboard_snapshots are immutable once finalised')

    const snapFix = readFileSync(
      resolve(root, 'supabase/migrations/20260328000000_final_c_snapshot_atomicity.sql'),
      'utf8',
    )
    expect(snapFix).toContain('Empty incomplete snapshot')
    expect(snapFix).toContain('leaderboard_snapshot_entries_deny_update')
    expect(snapFix).toMatch(/delete from public\.leaderboard_snapshots/i)
  })

  it('wires New Player + email provider fields in UI/edge sources', () => {
    const voucherUi = readFileSync(
      resolve(root, 'src/components/VoucherDetailsScreen.tsx'),
      'utf8',
    )
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
    const claimEdge = readFileSync(
      resolve(root, 'supabase/functions/claim-campaign-voucher/index.ts'),
      'utf8',
    )
    expect(voucherUi).toContain('New Player')
    expect(voucherUi).toContain('View Leaderboard')
    expect(voucherUi).toContain('readCachedClaimResult')
    expect(app).toContain('resetForNewPlayer')
    expect(claimEdge).toContain('emailProvider')
    expect(claimEdge).not.toContain('VITE_RESEND')
  })

  it('keeps 4C demo campaigns inactive and Final B non-redeemable by default', () => {
    const c1 = readFileSync(
      resolve(root, 'supabase/migrations/20260324000000_phase4c1_promotional_rewards.sql'),
      'utf8',
    )
    const finalB = readFileSync(
      resolve(root, 'supabase/migrations/20260327000000_final_b_voucher_claims.sql'),
      'utf8',
    )
    expect(c1).toContain("claims_enabled boolean not null default false")
    expect(c1).toContain('phase4c1-dev-placeholders')
    expect(c1).toContain("'draft'")
    expect(finalB).toContain("'demo'")
    expect(finalB).toContain('real_redeemable boolean not null default false')
    expect(finalB).toContain('promotional_issuance_config_live_gate')
    expect(finalB).not.toMatch(/update\s+public\.reward_campaigns[\s\S]{0,80}claims_enabled\s*=\s*true/i)
  })
})
