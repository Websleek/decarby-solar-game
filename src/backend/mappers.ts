import type {
  GameLevelVersion,
  GameLevelVersionRow,
  PlayerProfile,
  PlayerProfileRow,
  PublicPlayerProfile,
} from './types/database'

export function mapPlayerProfile(row: PlayerProfileRow): PlayerProfile {
  return {
    id: row.id,
    userId: row.user_id,
    publicNickname: row.public_nickname,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapPublicProfile(row: {
  id: string
  public_nickname: string
}): PublicPlayerProfile {
  return {
    id: row.id,
    publicNickname: row.public_nickname,
  }
}

export function mapLevelVersion(row: GameLevelVersionRow): GameLevelVersion {
  return {
    id: row.id,
    levelId: row.level_id,
    version: row.version,
    configurationHash: row.configuration_hash,
    active: row.active,
    createdAt: row.created_at,
  }
}
