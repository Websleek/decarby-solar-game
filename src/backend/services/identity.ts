import type { Session, User } from '@supabase/supabase-js'
import { isBackendConfigured } from '../config'
import { BackendError, toBackendError } from '../errors'
import { getSupabaseClient } from '../supabaseClient'

export type AuthState =
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'signedOut' }>
  | Readonly<{ kind: 'anonymous'; userId: string; session: Session }>

export interface IdentityService {
  getAuthState(): Promise<AuthState>
  ensureAnonymousSession(): Promise<AuthState>
  signOut(): Promise<AuthState>
  onAuthStateChange(listener: (state: AuthState) => void): () => void
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
