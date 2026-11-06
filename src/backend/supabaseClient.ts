import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isBackendConfigured, readBackendConfig } from './config'
import type { Database } from './types/database'

export type DecarbySupabaseClient = SupabaseClient<Database>

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
      storageKey: 'decarby-solar-auth',
    },
  })
  initializedForKey = key
  return client
}

export function resetSupabaseClientForTests(): void {
  client = null
  initializedForKey = null
}

export function hasSupabaseClient(): boolean {
  return isBackendConfigured() && getSupabaseClient() !== null
}
