/**
 * Prints exact Supabase CLI v3 commands for a SEPARATE staging project.
 * Does not execute remote writes.
 *
 *   node scripts/staging/cli-runbook.mjs
 *   node scripts/staging/cli-runbook.mjs --ref=YOUR_STAGING_REF
 */
const args = process.argv.slice(2)
const refArg = args.find((a) => a.startsWith('--ref='))
const STAGING_REF = refArg ? refArg.slice('--ref='.length) : process.env.STAGING_PROJECT_REF || 'YOUR_STAGING_PROJECT_REF'
const PROD_REF = 'lrohmaodpqbmvgxsspql'

if (STAGING_REF === PROD_REF) {
  console.error('Refusing to print write commands targeted at production.')
  process.exit(1)
}

console.log(`# Decarby Solar — staging CLI runbook (CLI v3)
# Staging ref: ${STAGING_REF}
# Linked production (DO NOT TARGET FOR THESE WRITES): ${PROD_REF}
# This script only prints commands. It does not apply or deploy.

## 0) Create / identify staging project
# Dashboard or:
npx supabase projects create decarby-solar-staging --org-id <ORG_ID> --db-password <PASSWORD> --region ap-southeast-1
# Then set STAGING_PROJECT_REF and copy .env.staging.example → .env.staging.local

## 1) Inspect migration status (read-only)
npx supabase migration list --remote=${STAGING_REF}

## 2) Dry-run pending migrations (no apply)
npx supabase db push --dry-run --remote=${STAGING_REF}

## 3) Apply migrations AFTER manual approval (writes)
# Fresh staging should receive the full chain through 4C.3.
# Order is enforced by timestamps: … → 4C.1 → 4C.2 → 4C.3
npx supabase db push --remote=${STAGING_REF}

## 4) Deploy required Edge Functions to staging (writes)
npx supabase functions deploy list-my-claims --remote=${STAGING_REF} --use-api
npx supabase functions deploy operator-claims --remote=${STAGING_REF} --use-api
npx supabase functions deploy record-promotional-consent --remote=${STAGING_REF} --use-api
npx supabase functions deploy finalise-leaderboard-snapshot --remote=${STAGING_REF} --use-api
# Also keep existing gameplay functions available on staging for regression:
npx supabase functions deploy get-leaderboard --remote=${STAGING_REF} --use-api
npx supabase functions deploy evaluate-achievements --remote=${STAGING_REF} --use-api
npx supabase functions deploy start-game-attempt --remote=${STAGING_REF} --use-api
npx supabase functions deploy submit-game-attempt --remote=${STAGING_REF} --use-api

## 5) Verify deployment (read-ish)
npx supabase migration list --remote=${STAGING_REF}
npx supabase functions list --remote=${STAGING_REF}

## 6) Provision one staff operator (SQL editor / service_role only)
# insert into public.staff_operators (user_id, role, active)
# values ('<staging-auth-user-uuid>', 'claims_reviewer', true);

## 7) Run DB-backed integration harness
# Ensure .env.staging.local is filled, then:
npm run test:staging:security

## 8) Frontend against staging (optional local Vite)
# Copy staging VITE_* into a throwaway shell env — do not overwrite .env.local:
#   $env:VITE_SUPABASE_URL=...; $env:VITE_SUPABASE_ANON_KEY=...; npm run dev

## NEVER
# npx supabase db push --remote=${PROD_REF}
# npx supabase link  (without explicit approval — would change linked production)
# Enable claims_enabled / public claims / voucher codes on staging demos without product approval
`)
