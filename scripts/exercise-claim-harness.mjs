/**
 * Phase 4C.2 — how to exercise the internal claim lifecycle locally.
 *
 * This does NOT call Supabase, enable public claims, or issue voucher codes.
 *
 * Run the automated harness suite:
 *   npm test -- shared/rewards/claimWorkflow.test.ts
 *
 * Or from trusted server/test code only:
 *   import { createInternalClaimHarness } from '../shared/rewards/claimHarness.ts'
 *   const harness = createInternalClaimHarness({ internalClaimsAllowed: true })
 *   // Use ephemeral fixtures with claimsEnabled=true — never mutate production demo rows.
 *   // Supply server-authoritative facts + adultConfirmed/consentGranted attestations.
 *   // requestClaim() creates pending inventory only; no codes/discounts are generated.
 *
 * Public path remains disabled:
 *   promotionalRewardService.requestPromotionalClaim() // always throws
 *
 * After migrations are reviewed (non-prod), service_role may call:
 *   request_player_reward_claim(...)
 *   transition_player_reward_claim(...)
 * anon/authenticated EXECUTE is revoked on both RPCs.
 */

console.log(`Phase 4C.2 claim harness guide

1) Automated:
   npm test -- shared/rewards/claimWorkflow.test.ts

2) In-memory API (tests/dev only):
   createInternalClaimHarness({ internalClaimsAllowed: true })
   - ephemeral fixtures only (claimsEnabled=true on copies, not production seeds)
   - server facts only (no client-forged achievements/stars/ranks)
   - adultConfirmed + consentGranted required
   - creates pending claims + audit events; never issues vouchers

3) Public claiming stays disabled. Do not wire a live claim button.

4) DB RPCs (service_role only, after reviewed non-prod migration apply):
   request_player_reward_claim / transition_player_reward_claim
`)
