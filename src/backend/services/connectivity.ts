import { isBackendConfigured, type BackendConnectionStatus } from '../config'
import { BackendError, toBackendError } from '../errors'
import { getSupabaseClient } from '../supabaseClient'

export type ConnectivitySnapshot = Readonly<{
  status: BackendConnectionStatus
  configured: boolean
  message: string
}>

export interface ConnectivityService {
  getStatus(): ConnectivitySnapshot
  ping(): Promise<ConnectivitySnapshot>
}

function snapshot(
  status: BackendConnectionStatus,
  configured: boolean,
  message: string,
): ConnectivitySnapshot {
  return { status, configured, message }
}

export const connectivityService: ConnectivityService = {
  getStatus() {
    if (!isBackendConfigured()) {
      return snapshot(
        'not_configured',
        false,
        'Online features are optional. Local rooftop challenges work without Supabase.',
      )
    }
    return snapshot('ready', true, 'Supabase credentials are configured.')
  },

  async ping() {
    if (!isBackendConfigured()) {
      return this.getStatus()
    }

    const client = getSupabaseClient()
    if (!client) {
      return snapshot('error', true, 'Could not create a Supabase client.')
    }

    try {
      const { error } = await client.from('game_level_versions').select('id').limit(1)
      if (error) {
        // Table may be empty or RLS may deny; auth/API reachability still counts as connected
        // when the project responds with a PostgREST error that is not a network failure.
        if (error.message.toLowerCase().includes('fetch')) {
          throw new BackendError('network', error.message, error)
        }
        return snapshot('connected', true, 'Reached Supabase. Some tables may still need migrations.')
      }
      return snapshot('connected', true, 'Connected to Supabase.')
    } catch (error) {
      const backendError = toBackendError(error)
      return snapshot('error', true, backendError.message)
    }
  },
}
