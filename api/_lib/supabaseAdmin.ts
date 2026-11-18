import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from './env'

let cached: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (cached) return cached
  const url = supabaseUrl()
  const key = supabaseServiceRoleKey()
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for staff APIs.')
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
