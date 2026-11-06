import { BackendError } from '../errors'
import type { GameMode } from '../../types/game'
import { competitiveAttemptService } from './competitiveAttempts'

export type ClaimedScorePayload = Readonly<{
  levelId: string
  levelVersionId: string
  gameMode: GameMode
  claimedScore: number
  claimedDurationMs: number
}>

export interface CompetitiveScoreService {
  /** Clients cannot mark scores verified — use submit-game-attempt Edge Function. */
  markVerified(): Promise<never>
  /** @deprecated Prefer competitiveAttemptService.startAttempt + submitAttempt. */
  submitClaimedScore(payload: ClaimedScorePayload): Promise<never>
}

export const competitiveScoreService: CompetitiveScoreService = {
  async submitClaimedScore() {
    throw new BackendError(
      'unsupported',
      'Use startAttempt/submitAttempt with a recorded action log. Claimed scores alone are not accepted.',
    )
  },
  async markVerified() {
    throw new BackendError('unauthorized', 'Clients cannot mark scores as verified.')
  },
}

export { competitiveAttemptService }
