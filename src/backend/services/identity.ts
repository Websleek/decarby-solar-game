import type { Session, User } from '@supabase/supabase-js'
import { isBackendConfigured } from '../config'
import { BackendError, toBackendError } from '../errors'
import {
  AUTH_STORAGE_KEY,
  getSupabaseClient,
  resetSupabaseClient,
} from '../supabaseClient'

export type AuthState =
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'signedOut' }>
  | Readonly<{ kind: 'anonymous'; userId: string; session: Session }>

export type SharedDeviceSessionEnd = Readonly<{
  kind: 'signedOut' | 'offline'
  /** True when auth storage was force-cleared after a sign-out failure. */
  forceCleared: boolean
  previousUserIdRedacted: string
}>

export interface IdentityService {
  getAuthState(): Promise<AuthState>
  ensureAnonymousSession(): Promise<AuthState>
  signOut(): Promise<AuthState>
  /**
   * Event-tablet / New Player: end the anonymous JWT and clear auth persistence.
   * Never throws in a way that leaves the previous JWT usable; force-clears on failure.
   * Does not delete server profiles, claims, vouchers, or leaderboards.
   */
  endSharedDeviceSession(): Promise<SharedDeviceSessionEnd>
  onAuthStateChange(listener: (state: AuthState) => void): () => void
}

function clearAuthPersistence(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(AUTH_STORAGE_KEY)
    // Defensive: remove any legacy supabase auth mirrors for this origin.
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key === AUTH_STORAGE_KEY || (key.startsWith('sb-') && key.includes('auth'))) {
        keys.push(key)
      }
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Private mode / blocked storage — client reset still drops in-memory session.
  }
  resetSupabaseClient()
}

function offlineState(): AuthState {
  return { kind: 'offline' }
}

function toAuthState(session: Session | null): AuthState {
  if (!session?.user) return { kind: 'signedOut' }
  return {
    kind: 'anonymous',
    userId: session.user.id,
    session,
  }
}

async function requireClient() {
  if (!isBackendConfigured()) {
    throw new BackendError(
      'not_configured',
      'Online identity is unavailable until Supabase is configured.',
    )
  }
  const client = getSupabaseClient()
  if (!client) {
    throw new BackendError('not_configured', 'Online identity is unavailable.')
  }
  return client
}

export const identityService: IdentityService = {
  async getAuthState() {
    if (!isBackendConfigured()) return offlineState()
    try {
      const client = await requireClient()
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      return toAuthState(data.session)
    } catch (error) {
      throw toBackendError(error, 'Could not read authentication state.')
    }
  },

  async ensureAnonymousSession() {
    if (!isBackendConfigured()) return offlineState()
    try {
      const client = await requireClient()
      const existing = await client.auth.getSession()
      if (existing.error) throw existing.error
      if (existing.data.session?.user) {
        return toAuthState(existing.data.session)
      }

      const { data, error } = await client.auth.signInAnonymously()
      if (error) throw error
      return toAuthState(data.session)
    } catch (error) {
      throw toBackendError(
        error,
        'Could not create an anonymous online session. Local play still works.',
      )
    }
  },

  async signOut() {
    if (!isBackendConfigured()) return offlineState()
    try {
      const client = await requireClient()
      const { error } = await client.auth.signOut()
      if (error) throw error
      return { kind: 'signedOut' }
    } catch (error) {
      throw toBackendError(error, 'Could not sign out of the online session.')
    }
  },

  async endSharedDeviceSession() {
    if (!isBackendConfigured()) {
      clearAuthPersistence()
      return {
        kind: 'offline',
        forceCleared: true,
        previousUserIdRedacted: redactUserId('offline'),
      }
    }

    let previousUserId = 'player'
    let forceCleared = false
    try {
      const prior = await this.getAuthState()
      if (prior.kind === 'anonymous') {
        previousUserId = prior.userId
      }
      await this.signOut()
      clearAuthPersistence()
    } catch {
      // Sign-out failed — never leave the previous JWT available for the next player.
      forceCleared = true
      clearAuthPersistence()
    }

    return {
      kind: 'signedOut',
      forceCleared,
      previousUserIdRedacted: redactUserId(previousUserId),
    }
  },

  onAuthStateChange(listener) {
    if (!isBackendConfigured()) {
      listener(offlineState())
      return () => undefined
    }
    const client = getSupabaseClient()
    if (!client) {
      listener(offlineState())
      return () => undefined
    }

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      listener(toAuthState(session))
    })
    return () => data.subscription.unsubscribe()
  },
}

/** Public helper — never display auth user IDs in UI. */
export function redactUserId(_user: User | string): string {
  return 'player'
}
