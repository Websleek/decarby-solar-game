import type { GameMode } from '../../types/game'
import type { GameAction } from '../../../shared/verification/types'
import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'

export type OnlineAttemptSession = Readonly<{
  attemptId: string
  levelVersionId: string
  configurationHash: string
  inventoryPieceIds: readonly string[]
  expiresAt: string
}>

export type SubmissionStatus = 'submitting' | 'verified' | 'rejected' | 'unable_to_connect'

export type SubmitAttemptResult =
  | Readonly<{
      ok: true
      status: 'verified'
      verifiedScore: number
      verifiedStars: number
      verifiedCoveragePercent: number
      verifiedDurationMs: number
      verifiedRecordId: string
      idempotent?: boolean
    }>
  | Readonly<{
      ok: false
      status: 'rejected' | 'unable_to_connect'
      code: string
      message: string
    }>

export type StartAttemptInput = Readonly<{
  levelId: string
  gameMode: GameMode
  clientNonce?: string
}>

export type SubmitAttemptInput = Readonly<{
  attemptId: string
  actions: readonly GameAction[]
  claimedScore: number
  claimedDurationMs: number
  claimedCoveragePercent: number
  configurationHash: string
}>

async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  if (!isBackendConfigured()) {
    throw new BackendError('not_configured', 'Online competition is not configured.')
  }
  const client = getSupabaseClient()
  if (!client) throw new BackendError('not_configured', 'Online competition is not configured.')

  const auth = await identityService.ensureAnonymousSession()
  if (auth.kind !== 'anonymous') {
    throw new BackendError('unauthenticated', 'Sign in anonymously to use online competition.')
  }

  const { data, error } = await client.functions.invoke(name, {
    body: body as Record<string, unknown>,
  })
  if (error) {
    throw toBackendError(error, 'Online competition request failed.')
  }
  return data as T
}

export const competitiveAttemptService = {
  async startAttempt(input: StartAttemptInput): Promise<OnlineAttemptSession> {
    const data = await invokeFunction<{
      ok?: boolean
      attemptId?: string
      levelVersionId?: string
      configurationHash?: string
      inventoryPieceIds?: string[]
      expiresAt?: string
      message?: string
      code?: string
    }>('start-game-attempt', input)

    if (!data?.ok || !data.attemptId || !data.inventoryPieceIds || !data.expiresAt) {
      throw new BackendError(
        data?.code === 'mode_locked' ? 'unauthorized' : 'unknown',
        data?.message ?? 'Could not start an online attempt.',
      )
    }

    return {
      attemptId: data.attemptId,
      levelVersionId: data.levelVersionId!,
      configurationHash: data.configurationHash!,
      inventoryPieceIds: data.inventoryPieceIds,
      expiresAt: data.expiresAt,
    }
  },

  async submitAttempt(input: SubmitAttemptInput): Promise<SubmitAttemptResult> {
    try {
      const data = await invokeFunction<Record<string, unknown>>('submit-game-attempt', input)
      if (data?.ok === true && data.status === 'verified') {
        return {
          ok: true,
          status: 'verified',
          verifiedScore: Number(data.verifiedScore),
          verifiedStars: Number(data.verifiedStars),
          verifiedCoveragePercent: Number(data.verifiedCoveragePercent),
          verifiedDurationMs: Number(data.verifiedDurationMs),
          verifiedRecordId: String(data.verifiedRecordId),
          idempotent: Boolean(data.idempotent),
        }
      }
      return {
        ok: false,
        status: 'rejected',
        code: String(data?.code ?? 'rejected'),
        message: String(data?.message ?? 'Submission was rejected.'),
      }
    } catch (error) {
      const backend = toBackendError(error)
      if (backend.code === 'network' || backend.code === 'not_configured') {
        return {
          ok: false,
          status: 'unable_to_connect',
          code: backend.code,
          message: 'Unable to connect. Your local result is still saved on this device.',
        }
      }
      return {
        ok: false,
        status: 'rejected',
        code: backend.code,
        message: backend.message,
      }
    }
  },
}
