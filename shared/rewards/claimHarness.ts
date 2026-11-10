import {
  countConsumingClaims,
  planClaimRequest,
  planClaimTransition,
  type ClaimantIdentity,
  type ClaimInventorySnapshot,
  type ClaimRequestOutcome,
  type ClaimTransitionOutcome,
  type ClaimWorkflowGate,
  type RewardAuditRecord,
  type RewardClaimRecord,
  type ServerEligibilityFacts,
} from './claimWorkflow.ts'
import type { ClaimStatus, RewardCampaign, RewardDefinition } from './types.ts'

/**
 * Explicitly gated internal claim harness for development/tests.
 * Does not enable public claiming. Does not generate voucher codes.
 *
 * Developer usage:
 * 1. Create `createInternalClaimHarness({ internalClaimsAllowed: true })`
 * 2. Register non-production campaign/reward fixtures with claimsEnabled=true
 *    (do not mutate production demo seeds in the database)
 * 3. Supply server-authoritative facts + adult/consent attestations
 * 4. Call `requestClaim` / `transitionClaim` against the in-memory store
 */
export type InternalClaimHarness = Readonly<{
  requestClaim: (input: {
    identity: ClaimantIdentity
    campaign: RewardCampaign
    reward: RewardDefinition
    serverFacts: ServerEligibilityFacts
    clientForgedProgress?: unknown
  }) => Promise<ClaimRequestOutcome>
  transitionClaim: (input: {
    claimId: string
    to: ClaimStatus
    actorRole?: RewardAuditRecord['actorRole']
    reason?: string
    /** When set, reject cross-account transition attempts. */
    actingPlayerId?: string
  }) => Promise<ClaimTransitionOutcome>
  getClaim: (claimId: string) => RewardClaimRecord | undefined
  listClaimsForPlayer: (playerId: string) => readonly RewardClaimRecord[]
  listAudits: () => readonly RewardAuditRecord[]
  /** Attempts to mutate an audit row — always fails (immutability). */
  tryMutateAudit: (auditId: string, patch: Partial<RewardAuditRecord>) => {
    ok: false
    reason: string
  }
  reset: () => void
}>

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve()

  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

export function createInternalClaimHarness(
  gate: ClaimWorkflowGate = { internalClaimsAllowed: true },
): InternalClaimHarness {
  const claims = new Map<string, RewardClaimRecord>()
  const audits: RewardAuditRecord[] = []
  const playerRewardIndex = new Map<string, string>()
  const mutex = new AsyncMutex()

  function key(playerId: string, rewardId: string): string {
    return `${playerId}::${rewardId}`
  }

  function inventoryFor(playerId: string, rewardId: string): ClaimInventorySnapshot {
    const existingId = playerRewardIndex.get(key(playerId, rewardId))
    const existingClaim = existingId ? claims.get(existingId) ?? null : null
    const playerClaims = [...claims.values()].filter(
      (c) => c.playerId === playerId && c.rewardId === rewardId,
    )
    const rewardClaims = [...claims.values()].filter((c) => c.rewardId === rewardId)
    return {
      existingClaim,
      playerConsumingCount: countConsumingClaims(playerClaims),
      rewardConsumingCount: countConsumingClaims(rewardClaims),
    }
  }

  function persistAudits(
    planned: readonly RewardAuditRecord[],
    claimId: string | null,
  ): RewardAuditRecord[] {
    const saved: RewardAuditRecord[] = []
    for (const row of planned) {
      const record: RewardAuditRecord = {
        ...row,
        id: newId('audit'),
        claimId: row.claimId === 'planned' ? claimId : (row.claimId ?? claimId),
      }
      audits.push(record)
      saved.push(record)
    }
    return saved
  }

  return {
    async requestClaim(input) {
      return mutex.runExclusive(async () => {
        // Snapshot inventory inside the exclusive section (transactional).
        const inventory = inventoryFor(input.identity.playerId, input.reward.id)
        const planned = planClaimRequest({
          gate,
          identity: input.identity,
          campaign: input.campaign,
          reward: input.reward,
          serverFacts: input.serverFacts,
          inventory,
          clientForgedProgress: input.clientForgedProgress,
        })

        if (planned.kind === 'rejected') {
          const savedAudits = persistAudits(planned.audits, null)
          return { ...planned, audits: savedAudits }
        }

        if (planned.kind === 'existing') {
          const savedAudits = persistAudits(planned.audits, planned.claim.id)
          return { ...planned, audits: savedAudits }
        }

        // Atomic create: insert claim then audits. On unique conflict, return existing.
        const indexKey = key(input.identity.playerId, input.reward.id)
        if (playerRewardIndex.has(indexKey)) {
          const existing = claims.get(playerRewardIndex.get(indexKey)!)!
          const eligibilityAudits = persistAudits(
            planned.audits.filter((a) => a.eventType === 'eligibility_checked'),
            existing.id,
          )
          return {
            kind: 'existing',
            claim: existing,
            eligibility: planned.eligibility,
            duplicate: true,
            audits: eligibilityAudits,
          }
        }

        const claimId = newId('claim')
        const claim: RewardClaimRecord = {
          ...planned.claim,
          id: claimId,
        }

        try {
          claims.set(claimId, claim)
          playerRewardIndex.set(indexKey, claimId)
          const savedAudits = persistAudits(planned.audits, claimId)
          return {
            kind: 'created',
            claim,
            eligibility: planned.eligibility,
            audits: savedAudits,
          }
        } catch (error) {
          // Rollback claim + index if audit persistence failed mid-flight.
          claims.delete(claimId)
          playerRewardIndex.delete(indexKey)
          throw error
        }
      })
    },

    async transitionClaim(input) {
      return mutex.runExclusive(async () => {
        const existing = claims.get(input.claimId)
        if (!existing) {
          return {
            kind: 'rejected' as const,
            code: 'unauthorized' as const,
            reason: 'Claim not found.',
            audits: [],
          }
        }
        if (input.actingPlayerId && input.actingPlayerId !== existing.playerId) {
          return {
            kind: 'rejected' as const,
            code: 'cross_account' as const,
            reason: 'Cross-account claim access denied.',
            audits: [],
          }
        }

        const planned = planClaimTransition({
          claim: existing,
          to: input.to,
          actorRole: input.actorRole,
          reason: input.reason,
        })
        if (planned.kind === 'rejected') {
          return planned
        }

        claims.set(existing.id, planned.claim)
        const savedAudits = persistAudits(planned.audits, planned.claim.id)
        return { ...planned, audits: savedAudits }
      })
    },

    getClaim(claimId) {
      return claims.get(claimId)
    },

    listClaimsForPlayer(playerId) {
      return [...claims.values()].filter((c) => c.playerId === playerId)
    },

    listAudits() {
      return [...audits]
    },

    tryMutateAudit() {
      return { ok: false, reason: 'reward_audit_events are immutable' }
    },

    reset() {
      claims.clear()
      audits.length = 0
      playerRewardIndex.clear()
    },
  }
}
