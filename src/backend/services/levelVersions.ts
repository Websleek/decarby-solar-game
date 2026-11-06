import { listLocalLevels } from '../../levels'
import { isBackendConfigured } from '../config'
import { BackendError, toBackendError } from '../errors'
import { hashLevelConfiguration } from '../levelHash'
import { mapLevelVersion } from '../mappers'
import { getSupabaseClient } from '../supabaseClient'
import type { GameLevelVersion } from '../types/database'

export type LocalLevelVersionMeta = Readonly<{
  levelId: string
  version: number
  configurationHash: string
  source: 'local'
}>

export interface LevelVersionService {
  listLocalMetadata(): readonly LocalLevelVersionMeta[]
  listActiveRemote(): Promise<readonly GameLevelVersion[]>
  getActiveRemote(levelId: string): Promise<GameLevelVersion | null>
}

export const levelVersionService: LevelVersionService = {
  listLocalMetadata() {
    return listLocalLevels().map((level) => ({
      levelId: level.id,
      version: level.puzzleVersion,
      configurationHash: hashLevelConfiguration(level),
      source: 'local' as const,
    }))
  },

  async listActiveRemote() {
    if (!isBackendConfigured()) return []
    try {
      const client = getSupabaseClient()
      if (!client) return []
      const { data, error } = await client
        .from('game_level_versions')
        .select('*')
        .eq('active', true)
        .order('level_id', { ascending: true })
      if (error) throw error
      return (data ?? []).map(mapLevelVersion)
    } catch (error) {
      throw toBackendError(error, 'Could not load remote level versions.')
    }
  },

  async getActiveRemote(levelId) {
    if (!isBackendConfigured()) return null
    try {
      const client = getSupabaseClient()
      if (!client) return null
      const { data, error } = await client
        .from('game_level_versions')
        .select('*')
        .eq('level_id', levelId)
        .eq('active', true)
        .maybeSingle()
      if (error) throw error
      return data ? mapLevelVersion(data) : null
    } catch (error) {
      throw toBackendError(error, 'Could not load that level version.')
    }
  },
}

export function assertRemoteLevelWritableNever(): never {
  throw new BackendError(
    'unsupported',
    'Clients cannot create or edit level versions. Use service-role migrations/seeds.',
  )
}
