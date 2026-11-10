/** Generated-style Database types for Phase 3A–4C.1 schema. */

export type GameModeDb = 'classic' | 'timeAttack'
export type VerificationStatus = 'pending' | 'rejected' | 'verified'
export type ModerationStatus = 'active' | 'flagged' | 'restricted'
export type RewardCampaignLifecycle =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'expired'
  | 'archived'
export type RewardPublishingStatus = 'draft' | 'published' | 'archived'
export type RewardTypeDb =
  | 'consultation_benefit'
  | 'fixed_discount'
  | 'percentage_discount'
  | 'voucher'
  | 'special_offer'
export type RewardClaimStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'redeemed'
  | 'expired'
  | 'cancelled'
export type RewardAuditEventType =
  | 'eligibility_checked'
  | 'claim_requested'
  | 'claim_approved'
  | 'claim_rejected'
  | 'claim_redeemed'
  | 'claim_expired'
  | 'campaign_updated'

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

export type RewardCampaignRow = {
  id: string
  slug: string
  title: string
  description: string
  lifecycle_status: RewardCampaignLifecycle
  starts_at: string | null
  ends_at: string | null
  public_catalog: boolean
  default_one_claim_per_player_reward: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type RewardDefinitionRow = {
  id: string
  campaign_id: string
  slug: string
  title: string
  short_description: string
  reward_type: RewardTypeDb
  illustrative_amount_cents: number | null
  currency: 'AUD'
  percentage_basis_points: number | null
  eligibility: Record<string, unknown>
  publishing_status: RewardPublishingStatus
  public_catalog: boolean
  claims_enabled: boolean
  display_order: number
  per_player_limit: number
  capacity_limit: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type PlayerRewardClaimRow = {
  id: string
  player_id: string
  reward_id: string
  campaign_id: string
  status: RewardClaimStatus
  claim_policy: 'one_per_player_reward' | 'campaign_controlled'
  eligibility_snapshot: Record<string, unknown>
  redemption_metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  decided_at: string | null
  redeemed_at: string | null
  expires_at: string | null
}

export type RewardAuditEventRow = {
  id: string
  event_type: RewardAuditEventType
  campaign_id: string | null
  reward_id: string | null
  claim_id: string | null
  player_id: string | null
  actor_role: 'system' | 'service_role' | 'player' | 'admin'
  payload: Record<string, unknown>
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
      reward_campaigns: {
        Row: RewardCampaignRow
        Insert: {
          id?: string
          slug: string
          title: string
          description?: string
          lifecycle_status?: RewardCampaignLifecycle
          starts_at?: string | null
          ends_at?: string | null
          public_catalog?: boolean
          default_one_claim_per_player_reward?: boolean
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string
          lifecycle_status?: RewardCampaignLifecycle
          starts_at?: string | null
          ends_at?: string | null
          public_catalog?: boolean
          default_one_claim_per_player_reward?: boolean
          metadata?: Record<string, unknown>
          updated_at?: string
        }
        Relationships: []
      }
      reward_definitions: {
        Row: RewardDefinitionRow
        Insert: {
          id?: string
          campaign_id: string
          slug: string
          title: string
          short_description?: string
          reward_type: RewardTypeDb
          illustrative_amount_cents?: number | null
          currency?: 'AUD'
          percentage_basis_points?: number | null
          eligibility: Record<string, unknown>
          publishing_status?: RewardPublishingStatus
          public_catalog?: boolean
          claims_enabled?: boolean
          display_order?: number
          per_player_limit?: number
          capacity_limit?: number | null
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          short_description?: string
          reward_type?: RewardTypeDb
          illustrative_amount_cents?: number | null
          percentage_basis_points?: number | null
          eligibility?: Record<string, unknown>
          publishing_status?: RewardPublishingStatus
          public_catalog?: boolean
          claims_enabled?: boolean
          display_order?: number
          per_player_limit?: number
          capacity_limit?: number | null
          metadata?: Record<string, unknown>
          updated_at?: string
        }
        Relationships: []
      }
      player_reward_claims: {
        Row: PlayerRewardClaimRow
        Insert: {
          id?: string
          player_id: string
          reward_id: string
          campaign_id: string
          status?: RewardClaimStatus
          claim_policy?: 'one_per_player_reward' | 'campaign_controlled'
          eligibility_snapshot?: Record<string, unknown>
          redemption_metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
          decided_at?: string | null
          redeemed_at?: string | null
          expires_at?: string | null
        }
        Update: {
          status?: RewardClaimStatus
          eligibility_snapshot?: Record<string, unknown>
          redemption_metadata?: Record<string, unknown>
          updated_at?: string
          decided_at?: string | null
          redeemed_at?: string | null
          expires_at?: string | null
        }
        Relationships: []
      }
      reward_audit_events: {
        Row: RewardAuditEventRow
        Insert: {
          id?: string
          event_type: RewardAuditEventType
          campaign_id?: string | null
          reward_id?: string | null
          claim_id?: string | null
          player_id?: string | null
          actor_role?: 'system' | 'service_role' | 'player' | 'admin'
          payload?: Record<string, unknown>
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
      reward_claim_transition_allowed: {
        Args: {
          p_from: RewardClaimStatus
          p_to: RewardClaimStatus
        }
        Returns: boolean
      }
      request_player_reward_claim: {
        Args: {
          p_player_id: string
          p_reward_id: string
          p_adult_confirmed: boolean
          p_consent_granted: boolean
          p_eligibility_snapshot?: Record<string, unknown>
          p_actor_role?: string
        }
        Returns: {
          claim_id: string | null
          claim_status: RewardClaimStatus | null
          inserted: boolean
          rejection_code: string | null
          rejection_reason: string | null
        }[]
      }
      transition_player_reward_claim: {
        Args: {
          p_claim_id: string
          p_to_status: RewardClaimStatus
          p_reason?: string | null
          p_actor_role?: string
        }
        Returns: {
          claim_id: string | null
          from_status: RewardClaimStatus | null
          to_status: RewardClaimStatus | null
          ok: boolean
          rejection_code: string | null
          rejection_reason: string | null
        }[]
      }
      is_active_staff_operator: {
        Args: Record<string, never>
        Returns: boolean
      }
      record_my_promotional_consent: {
        Args: {
          p_adult_self_attested: boolean
          p_terms_accepted: boolean
          p_terms_version: string
          p_marketing_opt_in?: boolean
        }
        Returns: {
          consent_id: string
          terms_version: string
          recorded_at: string
          marketing_opt_in: boolean
        }[]
      }
      list_my_reward_claims: {
        Args: Record<string, never>
        Returns: {
          claim_id: string
          reward_id: string
          reward_slug: string
          reward_title: string
          campaign_id: string
          status: RewardClaimStatus
          created_at: string
          updated_at: string
          decided_at: string | null
        }[]
      }
      operator_list_pending_claims: {
        Args: { p_limit?: number }
        Returns: {
          claim_id: string
          player_id: string
          public_nickname: string
          reward_id: string
          reward_slug: string
          reward_title: string
          campaign_id: string
          status: RewardClaimStatus
          created_at: string
          eligibility_snapshot: Record<string, unknown>
        }[]
      }
      operator_get_claim_detail: {
        Args: { p_claim_id: string }
        Returns: {
          claim_id: string
          player_id: string
          public_nickname: string
          reward_id: string
          reward_slug: string
          reward_title: string
          campaign_id: string
          status: RewardClaimStatus
          claim_policy: string
          eligibility_snapshot: Record<string, unknown>
          created_at: string
          updated_at: string
          decided_at: string | null
        }[]
      }
      operator_list_claim_audits: {
        Args: { p_claim_id: string }
        Returns: {
          audit_id: string
          event_type: RewardAuditEventType
          actor_role: string
          payload: Record<string, unknown>
          created_at: string
        }[]
      }
      operator_review_claim: {
        Args: {
          p_claim_id: string
          p_decision: string
          p_reason?: string | null
        }
        Returns: {
          claim_id: string | null
          from_status: RewardClaimStatus | null
          to_status: RewardClaimStatus | null
          ok: boolean
          rejection_code: string | null
          rejection_reason: string | null
        }[]
      }
      finalise_leaderboard_snapshot: {
        Args: {
          p_board: string
          p_period_label: string
          p_source_fingerprint: string
          p_level_id?: string | null
          p_period_start?: string | null
          p_period_end?: string | null
          p_limit?: number
        }
        Returns: {
          snapshot_id: string
          inserted: boolean
          entry_count: number
        }[]
      }
    }
    Enums: {
      game_mode: GameModeDb
      verification_status: VerificationStatus
      moderation_status: ModerationStatus
      reward_campaign_lifecycle: RewardCampaignLifecycle
      reward_publishing_status: RewardPublishingStatus
      reward_type: RewardTypeDb
      reward_claim_status: RewardClaimStatus
      reward_audit_event_type: RewardAuditEventType
    }
    CompositeTypes: Record<string, never>
  }
}
