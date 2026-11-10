/**
 * Final B — demo vs approved_live issuance configuration helpers.
 * Real redeemable issuing requires explicit approved_live + real_redeemable.
 */

import { PROMOTIONAL_CAMPAIGN_ID } from '../campaign/rewardTiers.ts'
import { PROMOTIONAL_TERMS_VERSION } from './consent.ts'

export const ISSUANCE_MODES = ['demo', 'approved_live'] as const
export type IssuanceMode = (typeof ISSUANCE_MODES)[number]

export type PromotionalIssuanceConfig = Readonly<{
  campaignId: string
  mode: IssuanceMode
  claimsEnabled: boolean
  realRedeemable: boolean
  termsVersion: string
  voucherTtlDays: number
}>

/** Fail-closed default when config is missing. */
export const FAIL_CLOSED_ISSUANCE: PromotionalIssuanceConfig = Object.freeze({
  campaignId: PROMOTIONAL_CAMPAIGN_ID,
  mode: 'demo',
  claimsEnabled: false,
  realRedeemable: false,
  termsVersion: PROMOTIONAL_TERMS_VERSION,
  voucherTtlDays: 90,
})

/** Local/dev seed mirror of Final B migration (demo claims allowed, not redeemable). */
export const DEMO_SEED_ISSUANCE: PromotionalIssuanceConfig = Object.freeze({
  campaignId: PROMOTIONAL_CAMPAIGN_ID,
  mode: 'demo',
  claimsEnabled: true,
  realRedeemable: false,
  termsVersion: PROMOTIONAL_TERMS_VERSION,
  voucherTtlDays: 90,
})

export function isRedeemableIssuance(config: PromotionalIssuanceConfig): boolean {
  return (
    config.mode === 'approved_live' &&
    config.claimsEnabled === true &&
    config.realRedeemable === true
  )
}

export function canAcceptClaims(config: PromotionalIssuanceConfig): boolean {
  return config.claimsEnabled === true
}

export function demoDisclaimer(config: PromotionalIssuanceConfig): string {
  if (isRedeemableIssuance(config)) {
    return 'This voucher is issued under an approved Decarby promotional campaign.'
  }
  return 'Demo mode: no redeemable discount has been issued. Codes are for workflow testing only.'
}

export function parseIssuanceConfigRow(row: {
  campaign_id?: unknown
  mode?: unknown
  claims_enabled?: unknown
  real_redeemable?: unknown
  terms_version?: unknown
  voucher_ttl_days?: unknown
} | null): PromotionalIssuanceConfig {
  if (!row) return FAIL_CLOSED_ISSUANCE
  const mode = row.mode === 'approved_live' ? 'approved_live' : 'demo'
  return {
    campaignId:
      typeof row.campaign_id === 'string' && row.campaign_id.length > 0
        ? row.campaign_id
        : PROMOTIONAL_CAMPAIGN_ID,
    mode,
    claimsEnabled: row.claims_enabled === true,
    realRedeemable: row.real_redeemable === true && mode === 'approved_live',
    termsVersion:
      typeof row.terms_version === 'string' && row.terms_version.length > 0
        ? row.terms_version
        : PROMOTIONAL_TERMS_VERSION,
    voucherTtlDays:
      typeof row.voucher_ttl_days === 'number' && row.voucher_ttl_days > 0
        ? Math.min(3650, Math.floor(row.voucher_ttl_days))
        : 90,
  }
}
