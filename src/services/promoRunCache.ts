/**
 * Persist in-progress event campaign run across refresh / interruption.
 * Cleared by New Player reset via PLAYER_SESSION_KEYS.promoDraft.
 */

import type { PromotionalCampaignRun } from '../../shared/campaign/types'
import { PLAYER_SESSION_KEYS } from './playerSessionReset'

export function writePromoRunDraft(run: PromotionalCampaignRun): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(PLAYER_SESSION_KEYS.promoDraft, JSON.stringify(run))
  } catch {
    // ignore quota / private mode
  }
}

export function readPromoRunDraft(): PromotionalCampaignRun | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(PLAYER_SESSION_KEYS.promoDraft)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PromotionalCampaignRun
    if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.levels)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPromoRunDraft(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(PLAYER_SESSION_KEYS.promoDraft)
  } catch {
    // ignore
  }
}

/** Next unfinished campaign level id, or null when all slots are done. */
export function nextIncompleteCampaignLevelId(
  run: PromotionalCampaignRun,
): string | null {
  const slot = run.levels.find((level) => level.status === 'pending')
  return slot?.levelId ?? null
}

export function isCampaignLevelLocked(
  run: PromotionalCampaignRun,
  levelId: string,
): boolean {
  const slot = run.levels.find((level) => level.levelId === levelId)
  if (!slot) return true
  return slot.status === 'local_complete' || slot.status === 'verified'
}

/**
 * Resolve which campaign run id (if any) should attach to a competitive attempt.
 *
 * Explicit `campaignRunId` from the caller wins — including `null` for offline —
 * so the first rooftop after `beginPromotionalCampaign` is not dropped while
 * React state (`promoFlowActive` / `promoRun`) is still stale from setState.
 */
export function resolveAttemptCampaignRunId(input: {
  explicitCampaignRunId?: string | null
  promoFlowActive: boolean
  serverBackedRunId?: string | null
}): string | null {
  if (input.explicitCampaignRunId !== undefined) {
    return input.explicitCampaignRunId
  }
  if (input.promoFlowActive && input.serverBackedRunId) {
    return input.serverBackedRunId
  }
  return null
}
