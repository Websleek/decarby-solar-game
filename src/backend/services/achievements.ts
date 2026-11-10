import {
  evaluateLocalPreviewAchievements,
  type LocalPreviewProgress,
} from '../../../shared/achievements/evaluate'
import {
  ACHIEVEMENT_BY_ID,
  listAchievements,
  type AchievementDefinition,
  type VerifiedAchievementId,
} from '../../../shared/achievements/registry'
import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'

export type EarnedAchievement = Readonly<{
  achievementId: VerifiedAchievementId
  earnedAt: string
  sourceAttemptId: string | null
  sourceRecordId: string | null
}>

export type AchievementCatalogEntry = AchievementDefinition &
  Readonly<{
    unlocked: boolean
    /** Verified online award timestamp when unlocked online. */
    earnedAt: string | null
    /** True when only local/guest progress suggests progress (not verified). */
    localPreviewOnly: boolean
  }>

export type AchievementSyncResult = Readonly<{
  earned: readonly EarnedAchievement[]
  newlyEarned: readonly VerifiedAchievementId[]
  catalog: readonly AchievementCatalogEntry[]
}>

function requireClient() {
  if (!isBackendConfigured()) {
    throw new BackendError('not_configured', 'Online achievements need Supabase credentials.')
  }
  const client = getSupabaseClient()
  if (!client) throw new BackendError('not_configured', 'Online achievements are not configured.')
  return client
}

function mapEarned(rows: unknown): EarnedAchievement[] {
  if (!Array.isArray(rows)) return []
  const out: EarnedAchievement[] = []
  for (const row of rows) {
    const typed = row as {
      achievement_id?: string
      earned_at?: string
      source_attempt_id?: string | null
      source_record_id?: string | null
      // Defensive: never treat award-attempt metadata as an unlock.
      inserted?: boolean
    }
    const id = typed.achievement_id
    if (!id || !(id in ACHIEVEMENT_BY_ID) || !typed.earned_at) continue
    out.push({
      achievementId: id as VerifiedAchievementId,
      earnedAt: typed.earned_at,
      sourceAttemptId: typed.source_attempt_id ?? null,
      sourceRecordId: typed.source_record_id ?? null,
    })
  }
  return out
}

function buildCatalog(
  earned: readonly EarnedAchievement[],
  localPreview: readonly VerifiedAchievementId[],
): AchievementCatalogEntry[] {
  const earnedMap = new Map(earned.map((row) => [row.achievementId, row]))
  return listAchievements().map((def) => {
    const online = earnedMap.get(def.id as VerifiedAchievementId)
    const preview = localPreview.includes(def.id as VerifiedAchievementId)
    return {
      ...def,
      unlocked: Boolean(online),
      earnedAt: online?.earnedAt ?? null,
      localPreviewOnly: !online && preview,
    }
  })
}

export const achievementService = {
  listCatalog(): readonly AchievementDefinition[] {
    return listAchievements()
  },

  previewFromLocalProgress(progress: LocalPreviewProgress): readonly AchievementCatalogEntry[] {
    const local = evaluateLocalPreviewAchievements({
      ...progress,
      hasLocalPlacement:
        progress.hasLocalPlacement ||
        progress.completedLevels.length > 0 ||
        Object.keys(progress.bestStars).length > 0,
    })
    return buildCatalog([], local)
  },

  async listMine(): Promise<readonly EarnedAchievement[]> {
    const client = requireClient()
    const auth = await identityService.getAuthState()
    if (auth.kind !== 'anonymous') return []

    const { data, error } = await client.rpc('list_my_achievements')
    if (error) throw toBackendError(error, 'Could not load achievements.')
    return mapEarned(data)
  },

  async sync(progress?: LocalPreviewProgress): Promise<AchievementSyncResult> {
    const client = requireClient()
    const auth = await identityService.ensureAnonymousSession()
    if (auth.kind !== 'anonymous') {
      throw new BackendError('unauthenticated', 'Sign in anonymously to sync verified achievements.')
    }

    const { data, error } = await client.functions.invoke('evaluate-achievements', {
      body: { mode: 'backfill' },
    })
    if (error) throw toBackendError(error, 'Could not sync achievements.')
    const payload = data as {
      ok?: boolean
      earned?: unknown
      newlyEarnedAchievements?: string[]
      message?: string
    }
    if (!payload?.ok) {
      throw new BackendError('unknown', payload?.message ?? 'Achievement sync failed.')
    }

    const earned = mapEarned(payload.earned)
    const newlyEarned = (payload.newlyEarnedAchievements ?? []).filter(
      (id): id is VerifiedAchievementId => id in ACHIEVEMENT_BY_ID,
    )
    const local = progress
      ? evaluateLocalPreviewAchievements({
          ...progress,
          hasLocalPlacement:
            progress.hasLocalPlacement ||
            progress.completedLevels.length > 0 ||
            Object.keys(progress.bestStars).length > 0,
        })
      : []
    return {
      earned,
      newlyEarned,
      catalog: buildCatalog(earned, local),
    }
  },

  mergeCatalog(
    earned: readonly EarnedAchievement[],
    progress: LocalPreviewProgress,
  ): readonly AchievementCatalogEntry[] {
    const local = evaluateLocalPreviewAchievements({
      ...progress,
      hasLocalPlacement:
        progress.hasLocalPlacement ||
        progress.completedLevels.length > 0 ||
        Object.keys(progress.bestStars).length > 0,
    })
    return buildCatalog(earned, local)
  },
}
