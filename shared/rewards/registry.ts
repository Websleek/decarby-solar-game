import type { RewardCampaign, RewardDefinition } from './types.ts'
import { assertValidRewardDefinition } from './validate.ts'

/**
 * Phase 4C.1 development placeholders only.
 * Inactive, hidden from live promotional claims, and non-redeemable.
 * Not approved customer offers — amounts are illustrative only.
 */
export const DEMO_REWARD_CAMPAIGN_ID = '00000000-0000-4000-8000-0000000004c1'

export const DEMO_REWARD_CAMPAIGN: Readonly<RewardCampaign> = Object.freeze({
  id: DEMO_REWARD_CAMPAIGN_ID,
  slug: 'phase4c1-dev-placeholders',
  title: 'Phase 4C.1 Development Placeholders',
  description:
    'Inactive example promotional rewards for architecture and eligibility tests. Not live offers.',
  lifecycleStatus: 'draft',
  startsAt: null,
  endsAt: null,
  publicCatalog: false,
  defaultOneClaimPerPlayerReward: true,
})

const DEMO_REWARDS_RAW: readonly RewardDefinition[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    campaignId: DEMO_REWARD_CAMPAIGN_ID,
    slug: 'solar-starter-consultation',
    title: 'Solar Starter consultation benefit',
    shortDescription:
      'Example consultation benefit tied to the verified Solar Starter achievement. Development placeholder only.',
    rewardType: 'consultation_benefit',
    illustrativeValue: null,
    percentageBasisPoints: null,
    publishingStatus: 'draft',
    publicCatalog: false,
    claimsEnabled: false,
    displayOrder: 10,
    capacityLimit: null,
    perPlayerLimit: 1,
    eligibility: {
      kind: 'achievement',
      achievementId: 'solar_starter',
    },
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    campaignId: DEMO_REWARD_CAMPAIGN_ID,
    slug: 'star-collector-example-100',
    title: 'Star Collector example A$100 discount',
    shortDescription:
      'Illustrative fixed discount example requiring verified Classic stars. Not redeemable.',
    rewardType: 'fixed_discount',
    illustrativeValue: Object.freeze({
      amountCents: 10000,
      currency: 'AUD',
    }),
    percentageBasisPoints: null,
    publishingStatus: 'draft',
    publicCatalog: false,
    claimsEnabled: false,
    displayOrder: 20,
    capacityLimit: null,
    perPlayerLimit: 1,
    eligibility: {
      kind: 'verified_stars_at_least',
      minStars: 10,
    },
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    campaignId: DEMO_REWARD_CAMPAIGN_ID,
    slug: 'solar-champion-example-250',
    title: 'Solar Champion example A$250 discount',
    shortDescription:
      'Illustrative fixed discount requiring verified champion achievement and rooftop completions. Not redeemable.',
    rewardType: 'fixed_discount',
    illustrativeValue: Object.freeze({
      amountCents: 25000,
      currency: 'AUD',
    }),
    percentageBasisPoints: null,
    publishingStatus: 'draft',
    publicCatalog: false,
    claimsEnabled: false,
    displayOrder: 30,
    capacityLimit: null,
    perPlayerLimit: 1,
    eligibility: {
      kind: 'all',
      rules: [
        { kind: 'achievement', achievementId: 'solar_champion' },
        { kind: 'verified_rooftops_at_least', minRooftops: 5 },
      ],
    },
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    campaignId: DEMO_REWARD_CAMPAIGN_ID,
    slug: 'solar-legend-example-500',
    title: 'Solar Legend example A$500 discount',
    shortDescription:
      'Illustrative top-tier placeholder. Requires verified max stars or a finalised leaderboard standing. Not redeemable.',
    rewardType: 'fixed_discount',
    illustrativeValue: Object.freeze({
      amountCents: 50000,
      currency: 'AUD',
    }),
    percentageBasisPoints: null,
    publishingStatus: 'draft',
    publicCatalog: false,
    claimsEnabled: false,
    displayOrder: 40,
    capacityLimit: 100,
    perPlayerLimit: 1,
    eligibility: {
      kind: 'any',
      rules: [
        { kind: 'verified_stars_at_least', minStars: 15 },
        {
          kind: 'leaderboard_rank_at_most',
          board: 'overall',
          maxRank: 10,
          requiresFinalisedSnapshot: true,
        },
      ],
    },
  },
]

export const DEMO_REWARD_DEFINITIONS: readonly RewardDefinition[] = Object.freeze(
  DEMO_REWARDS_RAW.map((reward) => {
    assertValidRewardDefinition(reward)
    return Object.freeze({
      ...reward,
      illustrativeValue: reward.illustrativeValue
        ? Object.freeze({ ...reward.illustrativeValue })
        : null,
      eligibility: Object.freeze(structuredClone(reward.eligibility)),
    })
  }),
)

export function getDemoRewardBySlug(slug: string): RewardDefinition | undefined {
  return DEMO_REWARD_DEFINITIONS.find((reward) => reward.slug === slug)
}

export function listDemoRewardDefinitions(): readonly RewardDefinition[] {
  return DEMO_REWARD_DEFINITIONS
}
