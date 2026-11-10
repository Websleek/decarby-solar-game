/**
 * Final C — New Player / shared-device session reset.
 * Clears local campaign progress + auth session. Never deletes server rows.
 */

import { identityService } from '../backend/services/identity'
import { localProgressService } from './localProgress'
import { clearCachedClaimResult } from './claimResultCache'
import type { PlayerProgress } from '../types/services'

export const PLAYER_SESSION_KEYS = {
  claimResult: 'decarby-solar-claim-result',
  promoDraft: 'decarby-solar-promo-draft',
} as const

function clearPlayerSessionKeys(): void {
  clearCachedClaimResult()
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(PLAYER_SESSION_KEYS.claimResult)
    sessionStorage.removeItem(PLAYER_SESSION_KEYS.promoDraft)
  } catch {
    // ignore
  }
}

export type NewPlayerResetResult = Readonly<{
  progress: PlayerProgress
  authEnded: boolean
  forceClearedAuth: boolean
}>

/**
 * Prepare the device for the next participant.
 * - Resets local progress (keeps sound + tutorial by default)
 * - Ends anonymous Supabase session / clears auth storage
 * - Clears claim interruption cache
 * Does NOT delete DB claims, vouchers, profiles, or leaderboard records.
 */
export async function resetForNewPlayer(): Promise<NewPlayerResetResult> {
  clearPlayerSessionKeys()

  const progress = await localProgressService.resetForNewPlayer({
    preserveSound: true,
    preserveTutorial: true,
  })

  const auth = await identityService.endSharedDeviceSession()

  return {
    progress,
    authEnded: auth.kind === 'signedOut' || auth.kind === 'offline',
    forceClearedAuth: auth.forceCleared,
  }
}

export function shouldConfirmResetBeforeFinish(input: {
  promoFlowActive: boolean
  claimCompleted: boolean
}): boolean {
  return input.promoFlowActive && !input.claimCompleted
}
