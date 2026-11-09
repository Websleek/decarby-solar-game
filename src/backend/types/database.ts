/** Generated-style Database types for Phase 3A schema. */

export type GameModeDb = 'classic' | 'timeAttack'
export type VerificationStatus = 'pending' | 'rejected' | 'verified'
export type ModerationStatus = 'active' | 'flagged' | 'restricted'

export type PlayerProfileRow = {
  id: string
  user_id: string
  public_nickname: string
  moderation_status: ModerationStatus
  created_at: string
  updated_at: string
}

export type GameLevelVersionRow = {
  id: string
  level_id: string
  version: number
  configuration_hash: string
  active: boolean
  created_at: string
}

export type GameScoreSubmissionRow = {
  id: string
  player_id: string
  level_id: string
  level_version_id: string
  game_mode: GameModeDb
  claimed_score: number
  claimed_duration_ms: number
  verification_status: VerificationStatus
  submitted_at: string
}

export type VerifiedGameRecordRow = {
  id: string
  player_id: string
  level_id: string
  level_version_id: string
  game_mode: GameModeDb
  verified_score: number
  verified_duration_ms: number
  verified_stars: number | null
  verified_coverage_percent: number | null
  verified_invalid_placements: number | null
  verified_at: string
}

export type PlayerAchievementRow = {
  id: string
  player_id: string
  achievement_id: string
  earned_at: string
  source_attempt_id: string | null
  source_record_id: string | null
  audit: Record<string, unknown>
  created_at: string
}

export type PublicPlayerProfile = Readonly<{
  id: string
  publicNickname: string
}>

export type PlayerProfile = Readonly<{
  id: string
  userId: string
  publicNickname: string
  moderationStatus: ModerationStatus
  createdAt: string
  updatedAt: string
}>

export type GameLevelVersion = Readonly<{
  id: string
  levelId: string
  version: number
  configurationHash: string
  active: boolean
  createdAt: string
}>

export type Database = {
  public: {
    Tables: {
      player_profiles: {
        Row: PlayerProfileRow
        Insert: {
          id?: string
          user_id: string
          public_nickname: string
          moderation_status?: ModerationStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          public_nickname?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_level_versions: {
        Row: GameLevelVersionRow
        Insert: {
          id?: string
          level_id: string
          version: number
          configuration_hash: string
          active?: boolean
          created_at?: string
        }
        Update: {
          active?: boolean
          configuration_hash?: string
        }
        Relationships: []
      }
      game_score_submissions: {
        Row: GameScoreSubmissionRow
        Insert: {
          id?: string
          player_id: string
          level_id: string
          level_version_id: string
          game_mode: GameModeDb
          claimed_score: number
          claimed_duration_ms: number
          verification_status?: VerificationStatus
          submitted_at?: string
        }
        Update: {
          verification_status?: VerificationStatus
        }
        Relationships: []
      }
      verified_game_records: {
        Row: VerifiedGameRecordRow
        Insert: {
          id?: string
          player_id: string
          level_id: string
          level_version_id: string
          game_mode: GameModeDb
          verified_score: number
          verified_duration_ms: number
          verified_stars?: number | null
          verified_coverage_percent?: number | null
          verified_invalid_placements?: number | null
          verified_at?: string
        }
        Update: {
          verified_score?: number
          verified_duration_ms?: number
          verified_stars?: number | null
          verified_coverage_percent?: number | null
          verified_invalid_placements?: number | null
          verified_at?: string
        }
        Relationships: []
      }
      player_achievements: {
        Row: PlayerAchievementRow
        Insert: {
          id?: string
          player_id: string
          achievement_id: string
          earned_at?: string
          source_attempt_id?: string | null
          source_record_id?: string | null
          audit?: Record<string, unknown>
          created_at?: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: {
      public_player_profiles: {
        Row: {
          id: string
          public_nickname: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Functions: {
      competition_week_bounds_canberra: {
        Args: Record<string, never>
        Returns: {
          week_start: string
          week_end: string
          label: string
        }[]
      }
      leaderboard_overall: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          rank: number
          public_nickname: string
          total_score: number
          levels_completed: number
          total_duration_ms: number
        }[]
      }
      leaderboard_weekly: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          rank: number
          public_nickname: string
          total_score: number
          levels_counted: number
          week_label: string
          week_end: string
        }[]
      }
      leaderboard_rooftop: {
        Args: { p_level_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          rank: number
          public_nickname: string
          verified_score: number
          verified_duration_ms: number
          level_id: string
          puzzle_version: number
        }[]
      }
      leaderboard_speed: {
        Args: { p_level_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          rank: number
          public_nickname: string
          verified_duration_ms: number
          verified_score: number
          level_id: string
          puzzle_version: number
        }[]
      }
      leaderboard_my_nickname: {
        Args: Record<string, never>
        Returns: string
      }
      leaderboard_speed_available: {
        Args: Record<string, never>
        Returns: boolean
      }
      award_player_achievement: {
        Args: {
          p_player_id: string
          p_achievement_id: string
          p_source_attempt_id?: string | null
          p_source_record_id?: string | null
          p_audit?: Record<string, unknown>
        }
        Returns: {
          achievement_id: string
          earned_at: string
          inserted: boolean
        }[]
      }
      list_my_achievements: {
        Args: Record<string, never>
        Returns: {
          achievement_id: string
          earned_at: string
          source_attempt_id: string | null
          source_record_id: string | null
        }[]
      }
    }
    Enums: {
      game_mode: GameModeDb
      verification_status: VerificationStatus
      moderation_status: ModerationStatus
    }
    CompositeTypes: Record<string, never>
  }
}
