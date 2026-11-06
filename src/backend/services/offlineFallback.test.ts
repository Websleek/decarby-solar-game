import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendError } from '../errors'
import { resetSupabaseClientForTests } from '../supabaseClient'
import { connectivityService } from './connectivity'
import { identityService } from './identity'
import { competitiveLeaderboardService } from './leaderboard'
import { levelVersionService } from './levelVersions'
import { profileService } from './profile'
import { competitiveScoreService } from './scoreSubmission'

describe('offline / local-only backend fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetSupabaseClientForTests()
  })

  it('reports not_configured when env is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSupabaseClientForTests()

    const status = connectivityService.getStatus()
    expect(status.configured).toBe(false)
    expect(status.status).toBe('not_configured')

    await expect(identityService.getAuthState()).resolves.toEqual({ kind: 'offline' })
    await expect(identityService.ensureAnonymousSession()).resolves.toEqual({ kind: 'offline' })
    await expect(profileService.getMyProfile()).resolves.toBeNull()
    await expect(levelVersionService.listActiveRemote()).resolves.toEqual([])
  })

  it('keeps local level version metadata available offline', () => {
    const local = levelVersionService.listLocalMetadata()
    expect(local.length).toBe(5)
    expect(local.every((row) => row.configurationHash.startsWith('fnv1a_'))).toBe(true)
  })

  it('blocks claimed-score-only writes; leaderboards stay offline-safe; verification stays server-side', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSupabaseClientForTests()

    await expect(competitiveScoreService.submitClaimedScore({
      levelId: 'sunny-house',
      levelVersionId: '00000000-0000-0000-0000-000000000000',
      gameMode: 'classic',
      claimedScore: 5500,
      claimedDurationMs: 12000,
    })).rejects.toBeInstanceOf(BackendError)

    await expect(competitiveScoreService.markVerified()).rejects.toMatchObject({
      code: 'unauthorized',
    })

    await expect(
      competitiveLeaderboardService.getTop({ levelId: 'sunny-house', gameMode: 'classic' }),
    ).rejects.toMatchObject({ code: 'not_configured' })
  })
})
