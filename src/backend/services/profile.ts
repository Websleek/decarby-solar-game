import { isBackendConfigured } from '../config'
import { BackendError, toBackendError } from '../errors'
import { mapPlayerProfile, mapPublicProfile } from '../mappers'
import { validateNickname } from '../nickname'
import { getSupabaseClient } from '../supabaseClient'
import type { PlayerProfile, PublicPlayerProfile } from '../types/database'
import { identityService } from './identity'

export interface ProfileService {
  getMyProfile(): Promise<PlayerProfile | null>
  upsertMyNickname(nickname: string): Promise<PlayerProfile>
  getPublicProfile(profileId: string): Promise<PublicPlayerProfile | null>
}

async function requireAuthedClient() {
  if (!isBackendConfigured()) {
    throw new BackendError(
      'not_configured',
      'Online profiles are unavailable until Supabase is configured.',
    )
  }
  const client = getSupabaseClient()
  if (!client) {
    throw new BackendError('not_configured', 'Online profiles are unavailable.')
  }

  const auth = await identityService.ensureAnonymousSession()
  if (auth.kind !== 'anonymous') {
    throw new BackendError('unauthenticated', 'Sign in anonymously to manage a nickname.')
  }
  return { client, userId: auth.userId }
}

export const profileService: ProfileService = {
  async getMyProfile() {
    if (!isBackendConfigured()) return null
    try {
      const { client, userId } = await requireAuthedClient()
      const { data, error } = await client
        .from('player_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data ? mapPlayerProfile(data) : null
    } catch (error) {
      if (error instanceof BackendError && error.code === 'not_configured') return null
      throw toBackendError(error, 'Could not load your online profile.')
    }
  },

  async upsertMyNickname(rawNickname) {
    const validated = validateNickname(rawNickname)
    if (!validated.ok) {
      throw new BackendError('validation', validated.reason)
    }

    try {
      const { client, userId } = await requireAuthedClient()
      const existing = await client
        .from('player_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (existing.error) throw existing.error

      if (existing.data) {
        const { data, error } = await client
          .from('player_profiles')
          .update({
            public_nickname: validated.nickname,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .select('*')
          .single()
        if (error) {
          if (error.code === '23505') {
            throw new BackendError('conflict', 'That nickname is already taken.')
          }
          throw error
        }
        return mapPlayerProfile(data)
      }

      const { data, error } = await client
        .from('player_profiles')
        .insert({
          user_id: userId,
          public_nickname: validated.nickname,
        })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') {
          throw new BackendError('conflict', 'That nickname is already taken.')
        }
        throw error
      }
      return mapPlayerProfile(data)
    } catch (error) {
      throw toBackendError(error, 'Could not save your nickname.')
    }
  },

  async getPublicProfile(profileId) {
    if (!isBackendConfigured()) return null
    try {
      const client = getSupabaseClient()
      if (!client) return null
      const { data, error } = await client
        .from('public_player_profiles')
        .select('id, public_nickname')
        .eq('id', profileId)
        .maybeSingle()
      if (error) throw error
      return data ? mapPublicProfile(data) : null
    } catch (error) {
      throw toBackendError(error, 'Could not load that public profile.')
    }
  },
}
