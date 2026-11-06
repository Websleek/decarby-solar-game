import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetSupabaseClientForTests } from '../supabaseClient'
import { identityService, redactUserId } from './identity'

describe('authentication state transitions', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetSupabaseClientForTests()
  })

  it('starts offline when backend is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSupabaseClientForTests()

    const states: string[] = []
    const unsubscribe = identityService.onAuthStateChange((state) => {
      states.push(state.kind)
    })
    expect(states).toEqual(['offline'])
    await expect(identityService.signOut()).resolves.toEqual({ kind: 'offline' })
    unsubscribe()
  })

  it('never exposes raw auth identifiers for display helpers', () => {
    expect(redactUserId('11111111-2222-3333-4444-555555555555')).toBe('player')
  })
})
