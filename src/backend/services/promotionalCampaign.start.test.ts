import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetSupabaseClientForTests } from '../supabaseClient'

const ensureAnonymousSession = vi.fn()
const upsertMyNickname = vi.fn()
const getMyProfile = vi.fn()
const invoke = vi.fn()

vi.mock('./identity', () => ({
  identityService: {
    ensureAnonymousSession: () => ensureAnonymousSession(),
  },
}))

vi.mock('./profile', () => ({
  profileService: {
    upsertMyNickname: (nickname: string) => upsertMyNickname(nickname),
    getMyProfile: () => getMyProfile(),
  },
}))

vi.mock('../supabaseClient', async () => {
  const actual = await vi.importActual<typeof import('../supabaseClient')>('../supabaseClient')
  return {
    ...actual,
    getSupabaseClient: () => ({
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
    }),
  }
})

describe('promotionalCampaignService.startServerRun', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetSupabaseClientForTests()
    ensureAnonymousSession.mockReset()
    upsertMyNickname.mockReset()
    getMyProfile.mockReset()
    invoke.mockReset()
  })

  it('does not silently create an offline run when start-campaign-run fails', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    resetSupabaseClientForTests()

    ensureAnonymousSession.mockResolvedValue({ kind: 'anonymous', userId: 'u1' })
    upsertMyNickname.mockResolvedValue(undefined)
    getMyProfile.mockResolvedValue({ id: 'p1', publicNickname: 'Nath' })
    invoke.mockResolvedValue({
      data: { ok: false, code: 'busy', message: 'Try again' },
      error: null,
    })

    const { promotionalCampaignService } = await import('./promotionalCampaign')
    const result = await promotionalCampaignService.startServerRun('Nath')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/try again|verified challenge|connection/i)
    }
  })

  it('returns a server-backed run when start-campaign-run succeeds', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    resetSupabaseClientForTests()

    ensureAnonymousSession.mockResolvedValue({ kind: 'anonymous', userId: 'u1' })
    upsertMyNickname.mockResolvedValue(undefined)
    getMyProfile.mockResolvedValue({ id: 'p1', publicNickname: 'Nath' })
    invoke.mockResolvedValue({
      data: {
        ok: true,
        runId: '11111111-1111-1111-1111-111111111111',
        createdAt: '2026-11-20T01:00:00.000Z',
      },
      error: null,
    })

    const { promotionalCampaignService } = await import('./promotionalCampaign')
    const result = await promotionalCampaignService.startServerRun('Nath')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.run.serverBacked).toBe(true)
      expect(result.run.id).toBe('11111111-1111-1111-1111-111111111111')
    }
  })

  it('fails closed when backend env is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSupabaseClientForTests()

    const { promotionalCampaignService } = await import('./promotionalCampaign')
    const result = await promotionalCampaignService.startServerRun('Nath')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('not_configured')
    }
  })
})
