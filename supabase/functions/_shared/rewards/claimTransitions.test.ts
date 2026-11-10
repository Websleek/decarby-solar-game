import { describe, expect, it } from 'vitest'
import {
  ALLOWED_CLAIM_TRANSITIONS,
  canTransitionClaim,
  assertClaimTransition,
  isCapacityConsumingClaimStatus,
} from './claimTransitions.ts'

describe('claimTransitions', () => {
  it('allows pending review outcomes and blocks terminal reopen', () => {
    expect(canTransitionClaim('pending', 'approved')).toBe(true)
    expect(canTransitionClaim('pending', 'rejected')).toBe(true)
    expect(canTransitionClaim('pending', 'cancelled')).toBe(true)
    expect(canTransitionClaim('pending', 'expired')).toBe(true)
    expect(canTransitionClaim('pending', 'redeemed')).toBe(false)
    expect(canTransitionClaim('rejected', 'pending')).toBe(false)
    expect(canTransitionClaim('redeemed', 'approved')).toBe(false)
  })

  it('never treats claim request as automatic redemption', () => {
    expect(ALLOWED_CLAIM_TRANSITIONS.pending.includes('redeemed')).toBe(false)
  })

  it('throws on invalid transitions', () => {
    expect(() => assertClaimTransition('cancelled', 'approved')).toThrow(/Invalid claim transition/)
  })

  it('counts pending/approved/redeemed toward capacity', () => {
    expect(isCapacityConsumingClaimStatus('pending')).toBe(true)
    expect(isCapacityConsumingClaimStatus('approved')).toBe(true)
    expect(isCapacityConsumingClaimStatus('redeemed')).toBe(true)
    expect(isCapacityConsumingClaimStatus('rejected')).toBe(false)
    expect(isCapacityConsumingClaimStatus('cancelled')).toBe(false)
  })
})
