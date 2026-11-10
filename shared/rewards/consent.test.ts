import { describe, expect, it } from 'vitest'
import {
  consentToClaimAttestation,
  PROMOTIONAL_TERMS_VERSION,
  validatePromotionalConsentInput,
} from './consent.ts'

describe('promotional consent', () => {
  it('maps active durable consent into claim attestations', () => {
    const mapped = consentToClaimAttestation({
      id: 'c1',
      playerId: 'p1',
      adultSelfAttested: true,
      adultAttestationMethod: 'self_attestation_unverified',
      termsAccepted: true,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
      marketingOptIn: false,
      recordedAt: '2026-11-10T00:00:00.000Z',
      revokedAt: null,
    })
    expect(mapped).toEqual({
      adultConfirmed: true,
      consentGranted: true,
      consentRecordedAt: '2026-11-10T00:00:00.000Z',
    })
  })

  it('fails closed when consent is revoked', () => {
    const mapped = consentToClaimAttestation({
      id: 'c1',
      playerId: 'p1',
      adultSelfAttested: true,
      adultAttestationMethod: 'self_attestation_unverified',
      termsAccepted: true,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
      marketingOptIn: true,
      recordedAt: '2026-11-10T00:00:00.000Z',
      revokedAt: '2026-11-11T00:00:00.000Z',
    })
    expect(mapped.adultConfirmed).toBe(false)
    expect(mapped.consentGranted).toBe(false)
  })

  it('separates marketing opt-in from required terms acceptance', () => {
    const result = validatePromotionalConsentInput({
      adultSelfAttested: true,
      termsAccepted: true,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
      marketingOptIn: false,
    })
    expect(result.ok).toBe(true)
  })
})
