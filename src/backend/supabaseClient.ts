import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isBackendConfigured, readBackendConfig } from './config'
import type { Database } from './types/database'

export type DecarbySupabaseClient = SupabaseClient<Database>

/** Browser auth persistence key (Supabase JS). Cleared on New Player reset. */
export const AUTH_STORAGE_KEY = 'decarby-solar-auth'

let client: DecarbySupabaseClient | null = null
let initializedForKey: string | null = null

function configKey(url: string, anonKey: string): string {
  return `${url}::${anonKey.slice(0, 12)}`
}

/** Returns a typed Supabase client, or null when offline/local-only. */
export function getSupabaseClient(): DecarbySupabaseClient | null {
  const config = readBackendConfig()
  if (!config) {
    client = null
    initializedForKey = null
    return null
  }

  const key = configKey(config.url, config.anonKey)
  if (client && initializedForKey === key) return client

  client = createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
    },
  })
  initializedForKey = key
  return client
}

/** Drop the singleton so the next call creates a fresh auth client/session. */
export function resetSupabaseClient(): void {
  client = null
  initializedForKey = null
}

/** @deprecated Prefer resetSupabaseClient — kept for existing tests. */
export function resetSupabaseClientForTests(): void {
  resetSupabaseClient()
}

export function hasSupabaseClient(): boolean {
  return isBackendConfigured() && getSupabaseClient() !== null
}
