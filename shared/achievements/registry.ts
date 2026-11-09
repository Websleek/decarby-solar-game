/** Phase 4A — typed achievement catalog (stable IDs for online verification). */

export const CAMPAIGN_LEVEL_IDS = [
  'sunny-house',
  'chimney-challenge',
  'tricky-rooftop',
  'solar-puzzle-master',
  'decarby-solar-champion',
] as const

export type CampaignLevelId = (typeof CAMPAIGN_LEVEL_IDS)[number]

export type AchievementIconId =
  | 'spark'
  | 'sun'
  | 'perfect'
  | 'speed'
  | 'stars'
  | 'champion'
  | 'master'
  | 'legend'

export type AchievementAvailability = 'live' | 'requires_telemetry'

export type AchievementDefinition = Readonly<{
  id: string
  title: string
  description: string
  icon: AchievementIconId
  /** Lower sorts first in Reward Centre. */
  displayOrder: number
  /** How the badge can be earned. */
  eligibility: string
  availability: AchievementAvailability
  /**
   * When availability is requires_telemetry, explain what is missing for
   * historic or unverifiable awards.
   */
  telemetryNote?: string
}>

export const ACHIEVEMENT_REGISTRY = [
  {
    id: 'first_spark',
    title: 'First Spark',
    description: 'Place your first verified solar panel online.',
    icon: 'spark',
    displayOrder: 10,
    eligibility: 'At least one successful panel placement inside a verified online attempt.',
    availability: 'live',
  },
  {
    id: 'solar_starter',
    title: 'Solar Starter',
    description: 'Complete Sunny House with a verified Classic run.',
    icon: 'sun',
    displayOrder: 20,
    eligibility: 'Verified Classic completion of Level 1 (sunny-house).',
    availability: 'live',
  },
  {
    id: 'perfect_fit',
    title: 'Perfect Fit',
    description: 'Finish a verified Classic level with zero invalid placements.',
    icon: 'perfect',
    displayOrder: 30,
    eligibility:
      'Verified Classic completion whose action log records zero invalid_place events.',
    availability: 'live',
    telemetryNote:
      'Requires online action logs that include invalid_place events. Historic attempts without that telemetry stay locked.',
  },
  {
    id: 'speed_builder',
    title: 'Speed Builder',
    description: 'Complete an eligible verified Time Attack rooftop.',
    icon: 'speed',
    displayOrder: 40,
    eligibility: 'At least one verified Time Attack record on an active rooftop version.',
    availability: 'live',
  },
  {
    id: 'star_collector',
    title: 'Star Collector',
    description: 'Earn at least ten stars across the five rooftops.',
    icon: 'stars',
    displayOrder: 50,
    eligibility:
      'Sum of best verified Classic stars across the five campaign levels is at least 10.',
    availability: 'live',
  },
  {
    id: 'solar_champion',
    title: 'Solar Champion',
    description: 'Verify Classic completions on all five rooftops.',
    icon: 'champion',
    displayOrder: 60,
    eligibility: 'Verified Classic records on all five active campaign levels.',
    availability: 'live',
  },
  {
    id: 'three_star_master',
    title: 'Three-Star Master',
    description: 'Earn three stars on every rooftop.',
    icon: 'master',
    displayOrder: 70,
    eligibility: 'Best verified Classic stars equal 3 on each of the five campaign levels.',
    availability: 'live',
  },
  {
    id: 'solar_legend',
    title: 'Solar Legend',
    description: 'Reach the top ten on a qualifying online leaderboard.',
    icon: 'legend',
    displayOrder: 80,
    eligibility:
      'At evaluation time, rank ≤ 10 on Overall Champions or any Speed Champions rooftop board.',
    availability: 'live',
  },
] as const satisfies readonly AchievementDefinition[]

export type VerifiedAchievementId = (typeof ACHIEVEMENT_REGISTRY)[number]['id']

export const ACHIEVEMENT_BY_ID: Readonly<Record<VerifiedAchievementId, AchievementDefinition>> =
  Object.fromEntries(ACHIEVEMENT_REGISTRY.map((row) => [row.id, row])) as Readonly<
    Record<VerifiedAchievementId, AchievementDefinition>
  >

export function listAchievements(): readonly AchievementDefinition[] {
  return [...ACHIEVEMENT_REGISTRY].sort((a, b) => a.displayOrder - b.displayOrder)
}

export function isVerifiedAchievementId(value: string): value is VerifiedAchievementId {
  return value in ACHIEVEMENT_BY_ID
}
