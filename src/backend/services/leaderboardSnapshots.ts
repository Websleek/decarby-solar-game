import { planSnapshotFinalise } from '../../../shared/leaderboard/snapshots'
import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'

export type SnapshotFinaliseResult = Readonly<{
  snapshotId: string | null
  inserted: boolean
  entryCount: number
  finalised: true
}>

function requireClient() {
  if (!isBackendConfigured()) {
    throw new BackendError('not_configured', 'Snapshots need Supabase credentials.')
  }
  const client = getSupabaseClient()
  if (!client) throw new BackendError('not_configured', 'Snapshots are not configured.')
  return client
}

export const leaderboardSnapshotService = {
  planLocal(input: {
    board: string
    periodLabel: string
    sourceFingerprint: string
    entryCount: number
    existingFingerprint: string | null
  }) {
    return planSnapshotFinalise(input)
  },

  async finalise(input: {
    board: 'overall' | 'speed'
    periodLabel: string
    sourceFingerprint: string
    levelId?: string
    periodStart?: string
    periodEnd?: string
    limit?: number
  }): Promise<SnapshotFinaliseResult> {
    const planned = planSnapshotFinalise({
      board: input.board,
      periodLabel: input.periodLabel,
      sourceFingerprint: input.sourceFingerprint,
      entryCount: 0,
      existingFingerprint: null,
    })
    if (planned.kind === 'rejected') {
      throw new BackendError('validation', planned.reason)
    }

    const client = requireClient()
    const auth = await identityService.ensureAnonymousSession()
    if (auth.kind !== 'anonymous') {
      throw new BackendError('unauthenticated', 'Sign in required.')
    }

    const { data, error } = await client.functions.invoke('finalise-leaderboard-snapshot', {
      body: input,
    })
    if (error) throw toBackendError(error, 'Could not finalise snapshot.')
    const payload = data as {
      ok?: boolean
      snapshotId?: string | null
      inserted?: boolean
      entryCount?: number
      message?: string
    }
    if (!payload?.ok) {
      throw new BackendError('unknown', payload?.message ?? 'Snapshot finalisation failed.')
    }
    return {
      snapshotId: payload.snapshotId ?? null,
      inserted: Boolean(payload.inserted),
      entryCount: Number(payload.entryCount ?? 0),
      finalised: true,
    }
  },
}
