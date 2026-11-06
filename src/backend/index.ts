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
export type {
  GameLevelVersion,
  PlayerProfile,
  PublicPlayerProfile,
  ModerationStatus,
  VerificationStatus,
} from './types/database'
