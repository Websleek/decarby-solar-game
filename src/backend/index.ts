export { isBackendConfigured, readBackendConfig } from './config'
export type { BackendConfig, BackendConnectionStatus } from './config'
export { BackendError, isBackendError, toBackendError } from './errors'
export type { BackendErrorCode } from './errors'
export {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  NICKNAME_PATTERN,
  normalizeNicknameKey,
  validateNickname,
} from './nickname'
export type { NicknameValidationResult } from './nickname'
export { getSupabaseClient, hasSupabaseClient, resetSupabaseClientForTests } from './supabaseClient'
export { hashLevelConfiguration, buildLevelConfigurationPayload } from './levelHash'
export { connectivityService } from './services/connectivity'
export type { ConnectivityService, ConnectivitySnapshot } from './services/connectivity'
export { identityService, redactUserId } from './services/identity'
export type { AuthState, IdentityService } from './services/identity'
export { profileService } from './services/profile'
export type { ProfileService } from './services/profile'
export { levelVersionService, assertRemoteLevelWritableNever } from './services/levelVersions'
export type { LevelVersionService, LocalLevelVersionMeta } from './services/levelVersions'
export { competitiveScoreService, competitiveAttemptService } from './services/scoreSubmission'
export type { ClaimedScorePayload, CompetitiveScoreService } from './services/scoreSubmission'
export type {
  OnlineAttemptSession,
  SubmitAttemptResult,
  SubmissionStatus,
} from './services/competitiveAttempts'
export { achievementService } from './services/achievements'
export type {
  AchievementCatalogEntry,
  AchievementSyncResult,
  EarnedAchievement,
} from './services/achievements'
export { competitiveLeaderboardService } from './services/leaderboard'
export type {
  CompetitiveLeaderboardService,
  CompetitionWeekInfo,
  LeaderboardBoard,
  LeaderboardFetchOptions,
  LeaderboardPage,
  LeaderboardQuery,
  OverallLeaderboardEntry,
  PublicLeaderboardEntry,
  RooftopLeaderboardEntry,
  SpeedLeaderboardEntry,
  WeeklyLeaderboardEntry,
} from './services/leaderboard'
export {
  promotionalRewardService,
  createPromotionalClaimTestHarness,
  planTrustedClaimRequest,
  planTrustedClaimTransition,
  requestPromotionalClaim,
} from './services/promotionalRewards'
export type {
  ClaimantIdentity,
  ClaimRequestOutcome,
  ClaimTransitionOutcome,
  ClaimWorkflowGate,
  InternalClaimHarness,
  PromotionalEligibilityFacts,
  PromotionalEligibilityView,
  ServerEligibilityFacts,
} from './services/promotionalRewards'
export { playerClaimsService } from './services/claims'
export type { PlayerClaimSummary } from './services/claims'
export { operatorClaimsService } from './services/operatorClaims'
export type {
  OperatorClaimDetail,
  OperatorPendingClaim,
} from './services/operatorClaims'
export { promotionalConsentService } from './services/promotionalConsent'
export type { RecordedPromotionalConsent } from './services/promotionalConsent'
export { leaderboardSnapshotService } from './services/leaderboardSnapshots'
export type { SnapshotFinaliseResult } from './services/leaderboardSnapshots'
export { promotionalCampaignService } from './services/promotionalCampaign'
export type {
  GameLevelVersion,
  PlayerProfile,
  PublicPlayerProfile,
  ModerationStatus,
  VerificationStatus,
} from './types/database'
