import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export function createUserClient(authHeader: string) {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) throw new Error('Missing Supabase env')
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) throw new Error('Missing service role env')
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
