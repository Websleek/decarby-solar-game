/**
 * Manual deployment checklist for /code/ staff voucher verification.
 * Does not mutate production.
 */
console.log(`
Decarby staff voucher verification — manual deploy checklist
============================================================

Architecture
- Same-origin Vercel serverless routes under /api/staff/*
- HttpOnly Secure SameSite=Strict cookie: decarby_staff_sess
- Staff password verified with STAFF_PASSWORD_HASH (scrypt) — never VITE_*
- DB RPCs staff_lookup_promotional_voucher / staff_redeem_promotional_voucher
  are service_role only; API uses SUPABASE_SERVICE_ROLE_KEY
- Separate from public anonymous Supabase auth and #operator-claims

1) Apply migration (staging first):
   npx supabase db query --linked < supabase/migrations/20260330000000_staff_voucher_redemption.sql
   (or your normal migrate workflow — do not auto-apply from this script)

2) Generate password hash (colon format — env-safe; stdout is ONE line only):
   npm run staff:hash-password -- "<staff-password>"

   IMPORTANT: Use the colon format scrypt:N:r:p:salt:hash
   Do NOT paste legacy dollar-separated scrypt$... values into env loaders —
   $NAME expansion silently corrupts letter-prefixed base64 segments and login
   always fails as "Incorrect password".

3) Set Vercel project env (Production + Preview as needed):
   STAFF_PASSWORD_HASH=<single scrypt:... line, no quotes>
   STAFF_SESSION_SECRET=<random 32+ chars>
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role>
   Keep real_redeemable=false until expressly approved.
   After changing env vars, redeploy Production (env changes do not hot-reload).

4) Commit + push the staff files to the branch Vercel deploys (usually main).
   Production 404 NOT_FOUND on /code/ means these files are not in the deployed revision:
   code/, src/code/, api/staff/, shared/staff/, vercel.json, vite multipage input.

5) Vercel project settings (Dashboard → Project → Settings → General/Build):
   - Framework Preset: Vite
   - Root Directory: repository root (.)
   - Build Command: npm run build
   - Output Directory: dist
   - Install Command: npm install
   - Confirm Production Branch includes the commit with staff files

6) Redeploy Production after push (Deployments → … → Redeploy, or push-triggered).

7) Verify:
   - https://<host>/code/          → Voucher Verification unlock screen (not 404)
   - https://<host>/code           → same page
   - Refresh on /code/             → still staff page (not game shell)
   - https://<host>/api/staff/session → JSON unauthorized/session (not HTML 404)
   - Wrong password rejected; repeated attempts rate-limited
   - DEMO voucher lookup works; Redeem stays disabled / rejected
   - Keep real_redeemable=false and VOUCHER_EMAIL_SEND_DEMO=false

Local API:
   vercel dev   # serves /api/* with env from .env.local / Vercel link
   npm run staff:smoke-login  # CommonJS bundle smoke (no secrets printed)

If production POST /api/staff/login returns FUNCTION_INVOCATION_FAILED:
   Root package.json has "type": "module" for Vite. Staff API must stay CommonJS via
   api/package.json + api/tsconfig.json, with helpers vendored under api/_lib (no
   shared/ imports with .ts extensions). Redeploy after those files land on the
   production branch.
`)
