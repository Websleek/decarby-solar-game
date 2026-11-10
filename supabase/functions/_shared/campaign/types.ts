import type { CampaignLevelId } from '../achievements/registry.ts'
import type { CampaignRewardDecision, RewardTierId } from './rewardTiers.ts'

export type CampaignRunStatus =
  | 'in_progress'
  | 'awaiting_verification'
  | 'completed'
  | 'reward_calculated'
  | 'abandoned'
  | 'ineligible'

export type CampaignLevelSlotStatus =
  | 'pending'
  | 'local_complete'
  | 'verified'
  | 'rejected'
  | 'offline'

export type CampaignLevelSlot = Readonly<{
  levelId: CampaignLevelId
  levelTitle: string
  levelNumber: number
  status: CampaignLevelSlotStatus
  stars: number | null
  score: number | null
  verifiedRecordId: string | null
  verifiedAttemptId: string | null
  levelVersion: number | null
}>

export type PromotionalCampaignRun = Readonly<{
  id: string
  campaignId: string
  campaignVersion: number
  playerId: string | null
  nickname: string | null
  status: CampaignRunStatus
  serverBacked: boolean
  levels: readonly CampaignLevelSlot[]
  reward: CampaignRewardDecision | null
  rewardTierId: RewardTierId | null
  createdAt: string
  completedAt: string | null
  /** Provisional client-only estimate — never treat as issued voucher. */
  provisional: boolean
}>

export type CampaignCompleteView = Readonly<{
  run: PromotionalCampaignRun
  nickname: string
  totalStars: number
  totalScore: number
  rewardLabel: string | null
  rewardAmountCents: number
  serverVerified: boolean
  voucherEligibleMessaging: string
  nextStepLabel: string
}>
