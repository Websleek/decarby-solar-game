import { describe, expect, it } from 'vitest'
import { createInternalClaimHarness } from './claimHarness.ts'
import type { ClaimantIdentity, ServerEligibilityFacts } from './claimWorkflow.ts'
import { DEMO_REWARD_CAMPAIGN, getDemoRewardBySlug } from './registry.ts'
import type { RewardCampaign, RewardDefinition } from './types.ts'

function activeFixture(rewardSlug: string): {
  campaign: RewardCampaign
  reward: RewardDefinition
} {
  const base = getDemoRewardBySlug(rewardSlug)!
  return {
    campaign: {
      ...DEMO_REWARD_CAMPAIGN,
      lifecycleStatus: 'active',
      publicCatalog: false,
    },
    reward: {
      ...base,
      publishingStatus: 'published',
      publicCatalog: false,
      claimsEnabled: true,
    },
  }
}

function identity(overrides: Partial<ClaimantIdentity> = {}): ClaimantIdentity {
  return {
    userId: 'user-1',
    playerId: 'player-1',
    moderationStatus: 'active',
    adultConsent: {
      adultConfirmed: true,
      consentGranted: true,
      consentRecordedAt: '2026-11-10T00:00:00.000Z',
    },
    ...overrides,
  }
}

const eligibleStars: ServerEligibilityFacts = {
  verifiedAchievementIds: [],
  verifiedStarsByLevel: {
    'sunny-house': 3,
    'chimney-challenge': 3,
    'tricky-rooftop': 2,
    'solar-puzzle-master': 1,
    'decarby-solar-champion': 1,
  },
  verifiedCompletedRooftops: [],
  finalisedLeaderboardStandings: [],
  nowIso: '2026-11-10T12:00:00.000Z',
}

describe('claim workflow harness', () => {
  it('creates a pending claim for an eligible adult with consent', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const result = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') return
    expect(result.claim.status).toBe('pending')
    expect(result.claim.redemptionMetadata.voucherIssued).toBe(false)
    expect(result.audits.some((a) => a.eventType === 'claim_requested')).toBe(true)
    expect(result.audits.some((a) => a.eventType === 'eligibility_checked')).toBe(true)
  })

  it('rejects ineligible users without creating claims', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('solar-starter-consultation')
    const result = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: {
        verifiedAchievementIds: [],
        verifiedStarsByLevel: {},
        verifiedCompletedRooftops: [],
        finalisedLeaderboardStandings: [],
      },
    })
    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.code).toBe('ineligible')
    expect(harness.listClaimsForPlayer('player-1')).toHaveLength(0)
  })

  it('rejects draft/inactive campaigns and claims_enabled=false', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const draft = getDemoRewardBySlug('solar-starter-consultation')!
    const inactive = await harness.requestClaim({
      identity: identity(),
      campaign: DEMO_REWARD_CAMPAIGN,
      reward: { ...draft, claimsEnabled: true, publishingStatus: 'published' },
      serverFacts: {
        verifiedAchievementIds: ['solar_starter'],
        verifiedStarsByLevel: {},
        verifiedCompletedRooftops: [],
        finalisedLeaderboardStandings: [],
      },
    })
    expect(inactive.kind).toBe('rejected')
    if (inactive.kind === 'rejected') {
      expect(['campaign_inactive', 'claims_disabled', 'ineligible']).toContain(inactive.code)
    }

    const { campaign, reward } = activeFixture('solar-starter-consultation')
    const disabled = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward: { ...reward, claimsEnabled: false },
      serverFacts: {
        verifiedAchievementIds: ['solar_starter'],
        verifiedStarsByLevel: {},
        verifiedCompletedRooftops: [],
        finalisedLeaderboardStandings: [],
      },
    })
    expect(disabled.kind).toBe('rejected')
    if (disabled.kind === 'rejected') expect(disabled.code).toBe('claims_disabled')
  })

  it('rejects expired campaigns', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { reward } = activeFixture('star-collector-example-100')
    const result = await harness.requestClaim({
      identity: identity(),
      campaign: {
        ...DEMO_REWARD_CAMPAIGN,
        lifecycleStatus: 'active',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2026-06-01T00:00:00.000Z',
      },
      reward,
      serverFacts: { ...eligibleStars, nowIso: '2026-11-10T00:00:00.000Z' },
    })
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') expect(result.code).toBe('campaign_expired')
  })

  it('requires adult and consent attestations', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const noAdult = await harness.requestClaim({
      identity: identity({
        adultConsent: { adultConfirmed: false, consentGranted: true },
      }),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(noAdult.kind).toBe('rejected')
    if (noAdult.kind === 'rejected') expect(noAdult.code).toBe('adult_verification_required')

    const noConsent = await harness.requestClaim({
      identity: identity({
        adultConsent: { adultConfirmed: true, consentGranted: false },
      }),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(noConsent.kind).toBe('rejected')
    if (noConsent.kind === 'rejected') expect(noConsent.code).toBe('consent_required')
  })

  it('rejects forged client progress bags', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('solar-starter-consultation')
    const result = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: {
        verifiedAchievementIds: [],
        verifiedStarsByLevel: {},
        verifiedCompletedRooftops: [],
        finalisedLeaderboardStandings: [],
      },
      clientForgedProgress: { achievements: ['solar_starter'], stars: 99 },
    })
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') expect(result.code).toBe('forged_input_rejected')
  })

  it('returns existing claim on duplicate retries', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const first = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(first.kind).toBe('created')
    const second = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(second.kind).toBe('existing')
    if (first.kind === 'created' && second.kind === 'existing') {
      expect(second.claim.id).toBe(first.claim.id)
      expect(second.duplicate).toBe(true)
    }
  })

  it('handles concurrent duplicate requests safely', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const req = {
      identity: identity(),
      campaign,
      reward,
      serverFacts: eligibleStars,
    }
    const [a, b] = await Promise.all([harness.requestClaim(req), harness.requestClaim(req)])
    const kinds = [a.kind, b.kind].sort()
    expect(kinds).toEqual(['created', 'existing'])
    expect(harness.listClaimsForPlayer('player-1')).toHaveLength(1)
  })

  it('enforces per-player and capacity limits', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('solar-legend-example-500')
    const limited = {
      ...reward,
      capacityLimit: 1,
      eligibility: { kind: 'verified_stars_at_least' as const, minStars: 10 },
    }
    const first = await harness.requestClaim({
      identity: identity({ playerId: 'player-a', userId: 'user-a' }),
      campaign,
      reward: limited,
      serverFacts: eligibleStars,
    })
    expect(first.kind).toBe('created')

    const capacity = await harness.requestClaim({
      identity: identity({ playerId: 'player-b', userId: 'user-b' }),
      campaign,
      reward: limited,
      serverFacts: eligibleStars,
    })
    expect(capacity.kind).toBe('rejected')
    if (capacity.kind === 'rejected') expect(capacity.code).toBe('capacity_exhausted')
  })

  it('rejects invalid transitions and cross-account access', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const created = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(created.kind).toBe('created')
    if (created.kind !== 'created') return

    const bad = await harness.transitionClaim({
      claimId: created.claim.id,
      to: 'redeemed',
    })
    expect(bad.kind).toBe('rejected')
    if (bad.kind === 'rejected') expect(bad.code).toBe('invalid_transition')

    const cross = await harness.transitionClaim({
      claimId: created.claim.id,
      to: 'rejected',
      actingPlayerId: 'other-player',
    })
    expect(cross.kind).toBe('rejected')
    if (cross.kind === 'rejected') expect(cross.code).toBe('cross_account')

    const ok = await harness.transitionClaim({
      claimId: created.claim.id,
      to: 'rejected',
      actingPlayerId: 'player-1',
      reason: 'ineligible after review',
    })
    expect(ok.kind).toBe('transitioned')
    if (ok.kind === 'transitioned') {
      expect(ok.claim.status).toBe('rejected')
      expect(ok.audits[0]?.payload.voucherIssued).toBe(false)
    }
  })

  it('keeps audits immutable and supports cancellation', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const created = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(created.kind).toBe('created')
    if (created.kind !== 'created') return

    const mutate = harness.tryMutateAudit(created.audits[0]!.id, {
      payload: { hacked: true },
    })
    expect(mutate.ok).toBe(false)

    const cancelled = await harness.transitionClaim({
      claimId: created.claim.id,
      to: 'cancelled',
      reason: 'player withdrew',
    })
    expect(cancelled.kind).toBe('transitioned')
    if (cancelled.kind === 'transitioned') {
      expect(cancelled.claim.status).toBe('cancelled')
      expect(cancelled.audits[0]?.payload.action).toBe('cancelled')
    }
  })

  it('refuses claims when internal gate is closed', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: false })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const result = await harness.requestClaim({
      identity: identity(),
      campaign,
      reward,
      serverFacts: eligibleStars,
    })
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') expect(result.code).toBe('workflow_gated')
  })

  it('rolls back index state if create path hits a conflict mid-flight', async () => {
    const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
    const { campaign, reward } = activeFixture('star-collector-example-100')
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        harness.requestClaim({
          identity: identity(),
          campaign,
          reward,
          serverFacts: eligibleStars,
        }),
      ),
    )
    const created = results.filter((r) => r.kind === 'created')
    const existing = results.filter((r) => r.kind === 'existing')
    expect(created).toHaveLength(1)
    expect(existing.length).toBe(7)
    expect(harness.listClaimsForPlayer('player-1')).toHaveLength(1)
  })
})
