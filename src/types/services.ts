import type { GameMode, LevelDefinition, LevelResult, TimeAttackResult } from './game'

/** Service boundaries for future API-backed implementations. */

export interface LevelService {
  getLevel(levelId: string): Promise<LevelDefinition>
  listLevels(): Promise<readonly LevelDefinition[]>
}

export interface PlayerProgress {
  completedLevels: readonly string[]
  unlockedLevels: readonly string[]
  /** Personal best for the level's current puzzleVersion only. */
  bestScores: Readonly<Record<string, number>>
  /** Puzzle version that each bestScores entry was earned on. */
  scorePuzzleVersions: Readonly<Record<string, number>>
  /** Best scores from older puzzle layouts (not compared to current PBs). */
  legacyBestScores: Readonly<Record<string, number>>
  bestStars: Readonly<Record<string, 0 | 1 | 2 | 3>>
  bestDurations: Readonly<Record<string, number>>
  /** Classic Mode Time Attack best qualifying times (100% coverage only). */
  timeAttackBestMs: Readonly<Record<string, number>>
  /** Levels completed under Perfect Roof rules. */
  perfectRoofLevels: readonly string[]
  preferredGameMode: GameMode | null
  selectedLevelId: string | null
  soundEnabled: boolean
  tutorialCompleted: boolean
  achievements: readonly string[]
}

export interface ProgressService {
  load(): Promise<PlayerProgress>
  save(progress: PlayerProgress): Promise<void>
  recordLevelResult(result: LevelResult): Promise<PlayerProgress>
  recordTimeAttackResult(result: TimeAttackResult): Promise<PlayerProgress>
  setSoundEnabled(enabled: boolean): Promise<PlayerProgress>
  setTutorialCompleted(completed: boolean): Promise<PlayerProgress>
  setSelectedLevel(levelId: string): Promise<PlayerProgress>
  setPreferredGameMode(mode: GameMode): Promise<PlayerProgress>
}

export interface ScoreSubmission {
  levelId: string
  score: number
  stars: 0 | 1 | 2 | 3
  coveragePercent: number
  durationMs: number
  submittedAt: string
}

export interface ScoreService {
  submitScore(submission: ScoreSubmission): Promise<void>
  getPersonalBest(levelId: string): Promise<number | null>
}

/** Phase 3A+ online competition boundaries (implemented under src/backend). */
export type OnlineFeatureStatus = 'not_configured' | 'ready' | 'unsupported'

export interface OnlineIdentityBoundary {
  status: OnlineFeatureStatus
  ensureAnonymousSession(): Promise<void>
}

export interface OnlineProfileBoundary {
  upsertNickname(nickname: string): Promise<{ publicNickname: string }>
}

export interface AchievementDefinition {
  id: string
  title: string
  description: string
}

export interface AchievementService {
  listAchievements(): Promise<readonly AchievementDefinition[]>
  unlock(achievementId: string): Promise<void>
  getUnlocked(): Promise<readonly string[]>
}

export interface LeaderboardEntry {
  rank: number
  displayName: string
  score: number
  stars: 0 | 1 | 2 | 3
}

export interface LeaderboardService {
  submit(levelId: string, score: number, stars: 0 | 1 | 2 | 3): Promise<void>
  getTop(levelId: string, limit: number): Promise<readonly LeaderboardEntry[]>
}

export interface RewardEligibility {
  eligible: boolean
  reason?: string
  voucherCode?: string
}

export interface RewardService {
  checkEligibility(playerId: string, campaignId: string): Promise<RewardEligibility>
  claimVoucher(playerId: string, campaignId: string): Promise<RewardEligibility>
}
