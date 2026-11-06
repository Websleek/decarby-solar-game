import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import type { GameMode } from '../../types/game'
import {
  findViewerRank,
  LEADERBOARD_LEVEL_IDS,
} from '../../../shared/leaderboard/ranking'

export type LeaderboardBoard = 'overall' | 'weekly' | 'rooftop' | 'speed'

export type LeaderboardQuery = Readonly<{
  levelId: string
  gameMode: GameMode
  limit?: number
}>

export type PublicLeaderboardEntry = Readonly<{
  rank: number
  publicNickname: string
  verifiedScore: number
  verifiedDurationMs: number
}>

export type OverallLeaderboardEntry = Readonly<{
  rank: number
  publicNickname: string
  totalScore: number
  levelsCompleted: number
  totalDurationMs: number
}>

export type WeeklyLeaderboardEntry = Readonly<{
  rank: number
  publicNickname: string
  totalScore: number
  levelsCounted: number
  weekLabel: string
  weekEnd: string
}>

export type RooftopLeaderboardEntry = Readonly<{
  rank: number
  publicNickname: string
  verifiedScore: number
  verifiedDurationMs: number
  levelId: string
  puzzleVersion: number
}>

export type SpeedLeaderboardEntry = Readonly<{
  rank: number
  publicNickname: string
  verifiedDurationMs: number
  verifiedScore: number
  levelId: string
  puzzleVersion: number
}>

export type CompetitionWeekInfo = Readonly<{
  weekStart: string
  weekEnd: string
  label: string
}>

export type LeaderboardPage<T> = Readonly<{
  entries: readonly T[]
  myNickname: string | null
  viewerRank: number | null
  speedAvailable: boolean
  week: CompetitionWeekInfo | null
}>

export type LeaderboardFetchOptions = Readonly<{
  limit?: number
  offset?: number
}>

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_OFFSET = 500

function clampLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
}

function clampOffset(offset?: number): number {
  return Math.min(Math.max(offset ?? 0, 0), MAX_OFFSET)
}

function assertKnownLevel(levelId: string): void {
  if (!LEADERBOARD_LEVEL_IDS.includes(levelId as (typeof LEADERBOARD_LEVEL_IDS)[number])) {
    throw new BackendError('validation', 'Unknown rooftop for rankings.')
  }
}

function requireClient() {
  if (!isBackendConfigured()) {
    throw new BackendError(
      'not_configured',
      'Online leaderboards need Supabase credentials. Local play still works offline.',
    )
  }
  const client = getSupabaseClient()
  if (!client) {
    throw new BackendError('not_configured', 'Online leaderboards are not configured.')
  }
  return client
}

type EdgeLeaderboardResponse<T> = {
  ok?: boolean
  board?: string
  entries?: T[]
  myNickname?: string | null
  speedAvailable?: boolean
  week?: CompetitionWeekInfo | null
  code?: string
  message?: string
}

/**
 * Production path: only the rate-limited get-leaderboard Edge Function.
 * Board RPCs are service_role-only after Phase 3C hardening.
 */
async function invokeLeaderboard<T extends { rank: number; publicNickname: string }>(
  body: Record<string, unknown>,
): Promise<LeaderboardPage<T>> {
  const client = requireClient()
  try {
    const { data, error } = await client.functions.invoke('get-leaderboard', { body })
    if (error) {
      throw toBackendError(error, 'Could not load Solar Champions.')
    }
    if (!data || typeof data !== 'object') {
      throw new BackendError('unknown', 'Leaderboard response was empty.')
    }
    const payload = data as EdgeLeaderboardResponse<T>
    if (payload.ok !== true) {
      const code = payload.code === 'rate_limited' ? 'network' : payload.code === 'speed_unavailable' ? 'unsupported' : 'unknown'
      throw new BackendError(code, payload.message ?? 'Could not load Solar Champions.')
    }
    if (!Array.isArray(payload.entries)) {
      throw new BackendError('unknown', 'Leaderboard response was invalid.')
    }
    const myNickname = payload.myNickname ?? null
    return {
      entries: payload.entries,
      myNickname,
      viewerRank: findViewerRank(payload.entries, myNickname),
      speedAvailable: Boolean(payload.speedAvailable),
      week: payload.week ?? null,
    }
  } catch (error) {
    if (error instanceof BackendError) throw error
    throw toBackendError(error, 'Could not load Solar Champions.')
  }
}

async function invokeStatus(): Promise<{
  myNickname: string | null
  speedAvailable: boolean
  week: CompetitionWeekInfo | null
}> {
  const page = await invokeLeaderboard({ board: 'status' })
  return {
    myNickname: page.myNickname,
    speedAvailable: page.speedAvailable,
    week: page.week,
  }
}

export interface CompetitiveLeaderboardService {
  getTop(query: LeaderboardQuery): Promise<readonly PublicLeaderboardEntry[]>
  getOverall(options?: LeaderboardFetchOptions): Promise<LeaderboardPage<OverallLeaderboardEntry>>
  getWeekly(options?: LeaderboardFetchOptions): Promise<LeaderboardPage<WeeklyLeaderboardEntry>>
  getRooftop(
    levelId: string,
    options?: LeaderboardFetchOptions,
  ): Promise<LeaderboardPage<RooftopLeaderboardEntry>>
  getSpeed(
    levelId: string,
    options?: LeaderboardFetchOptions,
  ): Promise<LeaderboardPage<SpeedLeaderboardEntry>>
  getCompetitionWeek(): Promise<CompetitionWeekInfo | null>
  isSpeedAvailable(): Promise<boolean>
  listRooftopIds(): readonly string[]
}

export const competitiveLeaderboardService: CompetitiveLeaderboardService = {
  listRooftopIds() {
    return LEADERBOARD_LEVEL_IDS
  },

  async getCompetitionWeek() {
    const status = await invokeStatus()
    return status.week
  },

  async isSpeedAvailable() {
    try {
      const status = await invokeStatus()
      return status.speedAvailable
    } catch (error) {
      if (error instanceof BackendError && error.code === 'not_configured') return false
      throw error
    }
  },

  async getTop(query) {
    if (query.gameMode !== 'classic') {
      throw new BackendError('unsupported', 'Use Speed Champions for Time Attack rankings.')
    }
    const page = await this.getRooftop(query.levelId, { limit: query.limit })
    return page.entries.map((entry) => ({
      rank: entry.rank,
      publicNickname: entry.publicNickname,
      verifiedScore: entry.verifiedScore,
      verifiedDurationMs: entry.verifiedDurationMs,
    }))
  },

  async getOverall(options = {}) {
    return invokeLeaderboard<OverallLeaderboardEntry>({
      board: 'overall',
      limit: clampLimit(options.limit),
      offset: clampOffset(options.offset),
    })
  },

  async getWeekly(options = {}) {
    return invokeLeaderboard<WeeklyLeaderboardEntry>({
      board: 'weekly',
      limit: clampLimit(options.limit),
      offset: clampOffset(options.offset),
    })
  },

  async getRooftop(levelId, options = {}) {
    assertKnownLevel(levelId)
    return invokeLeaderboard<RooftopLeaderboardEntry>({
      board: 'rooftop',
      levelId,
      limit: clampLimit(options.limit),
      offset: clampOffset(options.offset),
    })
  },

  async getSpeed(levelId, options = {}) {
    assertKnownLevel(levelId)
    const available = await this.isSpeedAvailable()
    if (!available) {
      throw new BackendError(
        'unsupported',
        'Speed Champions unlock after the first verified Time Attack result.',
      )
    }
    return invokeLeaderboard<SpeedLeaderboardEntry>({
      board: 'speed',
      levelId,
      limit: clampLimit(options.limit),
      offset: clampOffset(options.offset),
    })
  },
}
