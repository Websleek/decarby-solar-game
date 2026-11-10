/**
 * Frontend QA checklist for staging (manual). Prints steps only.
 *   node scripts/staging/frontend-qa-checklist.mjs
 */
console.log(`# Frontend QA — staging (manual)

Prerequisites:
- Staging project applied through 4C.3
- Edge functions deployed to staging
- Vite started with staging VITE_* in shell (do not overwrite .env.local)

## Reward Centre
[ ] Claim history section renders
[ ] Empty state shows claiming disabled messaging
[ ] No "Claim Reward" button / CTA
[ ] Promo aside still says coming soon / no codes

## Operator UI
[ ] Non-staff: Staff claim review link hidden
[ ] Staff operator provisioned: link visible
[ ] Pending list loads
[ ] Detail shows eligibility snapshot + audits
[ ] Approve → status approved, banner says no voucher issued
[ ] Second approve fails (invalid transition)
[ ] Reject path works on a fresh pending claim

## Unauthorized / offline
[ ] Signed-out / no profile: claim history unavailable message
[ ] Backend unset: offline badge path still works

## Regression
[ ] Classic mode playable
[ ] Time Attack unlock/play
[ ] Solar Champions leaderboards load
[ ] Online profile nickname create/update
[ ] Mobile layout: Reward Centre + operator detail stack cleanly

## Must remain false
[ ] Demo campaigns not published publicly
[ ] No voucher codes shown anywhere
[ ] No redemption UI
`)
