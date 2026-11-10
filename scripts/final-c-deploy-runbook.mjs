/**
 * Final C — prints exact manual deployment commands.
 * Does NOT execute migrations, deploys, commits, or pushes.
 *
 *   node scripts/final-c-deploy-runbook.mjs
 *   node scripts/final-c-deploy-runbook.mjs --ref=YOUR_PROJECT_REF
 */
const args = process.argv.slice(2)
const refArg = args.find((a) => a.startsWith('--ref='))
const REF = refArg ? refArg.slice('--ref='.length) : process.env.SUPABASE_PROJECT_REF || 'YOUR_PROJECT_REF'
const PROD_REF = 'lrohmaodpqbmvgxsspql'

console.log(`# Decarby Solar — Final C manual deployment runbook
# Target ref: ${REF}
# Known production ref: ${PROD_REF}
# This script only prints commands. It does not apply, deploy, commit, or push.

## A) Pre-flight (local, no remote writes)
npm test
npm run build
npm run test:staging:audit
npx supabase migration list --remote=${REF}

## B) Migration sequence (production currently has 4C.1 only)
# Pending in order:
#   20260324120000_phase4c2_claim_workflow.sql
#   20260325000000_phase4c3_claim_operations.sql
#   20260326000000_final_a_campaign_runs.sql
#   20260327000000_final_b_voucher_claims.sql
#   20260328000000_final_c_snapshot_atomicity.sql
#
# Preferred without a paid staging project:
#   1) npx supabase start   (requires Docker)
#   2) npx supabase db reset   # applies ALL local migrations to disposable local DB
#   3) Exercise claim + reset smoke against local Edge if configured
#   4) Only then dry-run / apply to the remote project after review
#
npx supabase db push --dry-run --remote=${REF}
# AFTER explicit approval:
# npx supabase db push --remote=${REF}

## C) Edge Functions required for Final A/B/C journey
npx supabase functions deploy start-campaign-run --remote=${REF} --use-api
npx supabase functions deploy evaluate-campaign-run --remote=${REF} --use-api
npx supabase functions deploy claim-campaign-voucher --remote=${REF} --use-api
npx supabase functions deploy resend-campaign-voucher-email --remote=${REF} --use-api
npx supabase functions deploy start-game-attempt --remote=${REF} --use-api
npx supabase functions deploy submit-game-attempt --remote=${REF} --use-api
npx supabase functions deploy get-leaderboard --remote=${REF} --use-api

## D) Edge secrets (never VITE_*)
npx supabase secrets set RESEND_API_KEY=YOUR_KEY --remote=${REF}
npx supabase secrets set TRANSACTIONAL_EMAIL_FROM="Decarby Solar <vouchers@YOUR_VERIFIED_DOMAIN>" --remote=${REF}
# Keep demo delivery unless expressly approved:
npx supabase secrets set VOUCHER_EMAIL_SEND_DEMO=false --remote=${REF}

## E) Resend sender domain
# 1) Add/verify domain in Resend dashboard
# 2) Publish SPF/DKIM DNS records
# 3) Use the verified from-address in TRANSACTIONAL_EMAIL_FROM
# 4) Send only to test recipients until campaign approval
# 5) Keep promotional_issuance_config.real_redeemable=false until authorized

## F) Git + Vercel (manual only — agent must not run these unless asked)
# git status
# git add -A
# git commit -m "Final C: New Player reset, voucher delivery status, production readiness"
# git push origin <branch>
# Vercel: confirm preview, then promote production after smoke tests

## G) Post-deploy smoke
# 1) Nickname → 5 Classic levels → reward reveal
# 2) Voucher form → one demo claim → delivery status is demo_log wording
# 3) Refresh voucher screen → same claim, no second voucher
# 4) New Player → nickname screen → new anonymous identity
# 5) Leaderboard still shows prior public nicknames/scores
# 6) Duplicate email rejected
# 7) Confirm real_redeemable remains false

## NEVER (unless expressly authorized)
# Enable approved_live + real_redeemable
# Email redeemable monetary vouchers
# Mark migrations applied without executing them
# Delete migration history
# Force-push main / skip hooks
`)

if (REF === PROD_REF) {
  console.log(`
# NOTE: ref matches known production (${PROD_REF}).
# Double-check dry-run output and product approval before any write command.
`)
}