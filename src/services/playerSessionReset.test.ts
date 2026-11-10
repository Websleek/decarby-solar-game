import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_STORAGE_KEY, resetSupabaseClientForTests } from '../backend/supabaseClient'
import { identityService } from '../backend/services/identity'
import { localProgressService } from './localProgress'
import {
  clearCachedClaimResult,
  readCachedClaimResult,
  writeCachedClaimResult,
} from './claimResultCache'
import {
  resetForNewPlayer,
  shouldConfirmResetBeforeFinish,
} from './playerSessionReset'
import type { ClaimCampaignVoucherSuccess } from '../../shared/rewards/voucherClaim'
import { classicResult } from '../test/levelResultFixtures'
import { LEVEL_1_SUNNY_HOUSE } from '../levels/level1'

function sampleClaim(): ClaimCampaignVoucherSuccess {
  return {
    ok: true,
    idempotent: false,
    claimId: 'claim-1',
    voucherId: 'voucher-1',
    emailJobId: 'job-1',
    code: 'DEMO-AAAA-BBBB-CCCC',
    amountCents: 10000,
    tierId: 'tier_100',
    expiresAt: '2027-01-01T00:00:00.000Z',
    demo: true,
    redeemable: false,
    issuanceMode: 'demo',
    claimStatus: 'email_sent',
    emailStatus: 'sent',
    emailProvider: 'demo_log',
    message: 'processed',
  }
}

describe('New Player reset / session isolation', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    resetSupabaseClientForTests()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    resetSupabaseClientForTests()
    vi.restoreAllMocks()
  })

  it('requires confirmation only before a finished claim', () => {
    expect(
      shouldConfirmResetBeforeFinish({ promoFlowActive: true, claimCompleted: false }),
    ).toBe(true)
    expect(
      shouldConfirmResetBeforeFinish({ promoFlowActive: true, claimCompleted: true }),
    ).toBe(false)
    expect(
      shouldConfirmResetBeforeFinish({ promoFlowActive: false, claimCompleted: false }),
    ).toBe(false)
  })

  it('clears local campaign progress and claim cache without touching invented leaderboard storage', async () => {
    await localProgressService.recordLevelResult(
      classicResult({
        levelId: LEVEL_1_SUNNY_HOUSE.id,
        score: 1200,
        stars: 3,
        coveragePercent: 100,
        achievements: ['solar-starter'],
      }),
    )
    writeCachedClaimResult('run-abc', sampleClaim())
    expect(readCachedClaimResult('run-abc')?.claimId).toBe('claim-1')

    const leaderboardMarker = 'decarby-fake-leaderboard-cache'
    localStorage.setItem(leaderboardMarker, JSON.stringify({ kept: true }))

    const outcome = await resetForNewPlayer()
    expect(outcome.progress.completedLevels).toEqual([])
    expect(outcome.progress.bestScores).toEqual({})
    expect(outcome.progress.unlockedLevels).toEqual(['sunny-house'])
    expect(readCachedClaimResult('run-abc')).toBeNull()
    expect(localStorage.getItem(leaderboardMarker)).toBe(JSON.stringify({ kept: true }))
  })

  it('force-clears auth storage when sign-out fails so the next player cannot reuse JWT', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-key')
    resetSupabaseClientForTests()

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ access_token: 'previous-player' }))
    vi.spyOn(identityService, 'signOut').mockRejectedValue(new Error('network'))

    const ended = await identityService.endSharedDeviceSession()
    expect(ended.forceCleared).toBe(true)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(ended.previousUserIdRedacted).toBe('player')
  })

  it('restores claim interruption cache for the same run only', () => {
    writeCachedClaimResult('run-1', sampleClaim())
    expect(readCachedClaimResult('run-2')).toBeNull()
    expect(readCachedClaimResult('run-1')?.voucherId).toBe('voucher-1')
    clearCachedClaimResult()
    expect(readCachedClaimResult('run-1')).toBeNull()
  })
})
