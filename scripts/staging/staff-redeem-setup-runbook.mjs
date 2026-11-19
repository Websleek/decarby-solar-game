/**
 * Minimal staging setup for staff single-use redeem QA.
 * Prints commands only — does not write to production or create credentials.
 *
 *   node scripts/staging/staff-redeem-setup-runbook.mjs
 */
const PROD_REF = 'lrohmaodpqbmvgxsspql'
const KNOWN_STAGING_REF = 'ixsejdbiyfrhtxxfagls'
const KNOWN_STAGING_NAME = 'decarby-solar-roof-challenge-staging'

console.log(`# Decarby Solar — minimal staging setup for staff redeem QA
# Production (DO NOT WRITE): ${PROD_REF}
# Existing staging project: ${KNOWN_STAGING_NAME} (${KNOWN_STAGING_REF})
# Last observed status: INACTIVE — restore in Dashboard before DB commands.

## A) Restore / confirm staging (Dashboard)
1. Open https://supabase.com/dashboard/project/${KNOWN_STAGING_REF}
2. If paused/inactive, click Restore / Unpause and wait until Active.
3. Project Settings → API:
   - Project URL
   - anon (publishable) key
   - service_role key  (server only — never VITE_*)
4. Confirm the project ref in the URL/settings is ${KNOWN_STAGING_REF}
   and is NOT ${PROD_REF}.

## B) Create .env.staging.local (gitignored)
Copy .env.staging.example → .env.staging.local and set:

STAGING_PROJECT_REF=${KNOWN_STAGING_REF}
STAGING_SUPABASE_URL=https://${KNOWN_STAGING_REF}.supabase.co
STAGING_SUPABASE_ANON_KEY=<staging anon key>
STAGING_SUPABASE_SERVICE_ROLE_KEY=<staging service_role key>

# Optional for local /code/ against staging API+DB:
VITE_SUPABASE_URL=https://${KNOWN_STAGING_REF}.supabase.co
VITE_SUPABASE_ANON_KEY=<staging anon key>

NEVER paste production service_role into these STAGING_* variables.
NEVER set STAGING_* to ${PROD_REF}.

## C) Apply migrations to STAGING ONLY (after restore)
npx supabase migration list --remote=${KNOWN_STAGING_REF}
npx supabase db push --dry-run --remote=${KNOWN_STAGING_REF}
npx supabase db push --remote=${KNOWN_STAGING_REF}

# Confirm staff redeem migration is present:
# 20260330000000_staff_voucher_redemption.sql

## D) Run integration harness (writes only to staging)
npm run staff:redeem-integration
# or keep fixture rows:
npm run staff:redeem-integration -- --keep

Harness checks:
- refuses production ref
- creates isolated campaign staff-redeem-test-v1 (A$50 / 30 days)
- lookup + first redeem + second reject + redeemed_at immutable
- concurrent single-winner
- does not flip event-three-rooftop-v1 on staging if present

## E) Optional UI check (staging-backed)
# Local vercel/API with STAGING supabase env — not production Vercel Production env.
# Open /code/, search the printed DSR- code after --keep.

## F) Verify SQL on staging
npx supabase db query --remote=${KNOWN_STAGING_REF} --read-only "select campaign_id, mode, claims_enabled, real_redeemable from promotional_issuance_config order by campaign_id;"
npx supabase db query --remote=${KNOWN_STAGING_REF} --read-only "select code, status, amount_cents, demo, redeemable, redeemed_at from promotional_vouchers where campaign_id='staff-redeem-test-v1';"

## NEVER
npx supabase db push --remote=${PROD_REF}
npx supabase link --project-ref ${PROD_REF}
# Enable production real_redeemable
# Reuse production service_role as STAGING_SUPABASE_SERVICE_ROLE_KEY
`)
