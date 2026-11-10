import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { createServiceClient, createUserClient } from './supabase.ts'

export type AuthedContext = Readonly<{
  user: User
  userClient: SupabaseClient
  admin: SupabaseClient
  authHeader: string
}>

export type PlayerProfileRow = Readonly<{
  id: string
  moderation_status: string
  public_nickname: string
}>

export async function requireAuthenticatedUser(
  req: Request,
): Promise<AuthedContext | { error: 'unauthenticated' }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { error: 'unauthenticated' }

  const userClient = createUserClient(authHeader)
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser()
  if (error || !user) return { error: 'unauthenticated' }

  return {
    user,
    userClient,
    admin: createServiceClient(),
    authHeader,
  }
}

export async function loadActiveProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<PlayerProfileRow | null> {
  const { data } = await admin
    .from('player_profiles')
    .select('id, moderation_status, public_nickname')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data || data.moderation_status !== 'active') return null
  return data as PlayerProfileRow
}

export async function isStaffOperator(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('staff_operators')
    .select('user_id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle()
  return Boolean(data?.user_id)
}
