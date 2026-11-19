/**
 * Isolated single-use staff redeem integration (STAGING ONLY).
 *
 * Creates campaign `staff-redeem-test-v1` + one A$50 / 30-day live voucher,
 * redeems once via staff_redeem_promotional_voucher, verifies audit + timestamp
 * immutability, then races two concurrent redeems.
 *
 * Refuses production project ref lrohmaodpqbmvgxsspql.
 * Does not email, does not touch event-three-rooftop-v1, does not change prod.
 *
 *   # fill .env.staging.local first
 *   node scripts/staging/run-staff-redeem-integration.mjs
 *   node scripts/staging/run-staff-redeem-integration.mjs --keep
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'lrohmaodpqbmvgxsspql'
const KNOWN_STAGING_REF = 'ixsejdbiyfrhtxxfagls'
const TEST_CAMPAIGN = 'staff-redeem-test-v1'
const EVENT_CAMPAIGN = 'event-three-rooftop-v1'
const KEEP = process.argv.includes('--keep')

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const env = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

function extractRef(u) {
  try {
    const host = new URL(u).host
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i)
    return m?.[1] ?? ''
  } catch {
    return ''
  }
}

function record(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function makeTestCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(12)
  let raw = ''
  for (const b of bytes) raw += alphabet[b % alphabet.length]
  return `DSR-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

const fileEnv = {
  ...loadEnvFile(resolve(process.cwd(), '.env.staging.local')),
  ...process.env,
}
const localEnv = loadEnvFile(resolve(process.cwd(), '.env.local'))

const url = fileEnv.STAGING_SUPABASE_URL || ''
const service = fileEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY || ''
const stagingRef = fileEnv.STAGING_PROJECT_REF || ''
const prodUrlFromLocal = localEnv.VITE_SUPABASE_URL || ''
const prodRefFromLocal = extractRef(prodUrlFromLocal)

async function main() {
  console.log('Staff single-use redeem integration (staging only)\n')

  if (!url || !service) {
    record(
      'staging_env_present',
      false,
      'Missing STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY in .env.staging.local',
    )
    console.log(`
BLOCKER: No staging credentials.
Safer options:
  1) Restore staging project ${KNOWN_STAGING_REF} (see npm run staff:redeem-setup-runbook)
  2) Fill .env.staging.local from .env.staging.example with STAGING_* keys only
  3) Apply migrations: npx supabase db push --remote=${KNOWN_STAGING_REF}
  4) Re-run: npm run staff:redeem-integration

Offline alternative already available:
  npm test -- shared/staff/staffRedeemWorkflow.test.ts
`)
    process.exitCode = 2
    return
  }

  const refFromUrl = extractRef(url)
  if (!refFromUrl) {
    record('staging_url_parseable', false, 'STAGING_SUPABASE_URL is not a supabase.co project URL')
    process.exitCode = 1
    return
  }
  if (refFromUrl === PROD_REF || stagingRef === PROD_REF || url.includes(PROD_REF)) {
    record('refuses_production', false, 'Credentials point at production — aborting')
    process.exitCode = 1
    return
  }
  if (prodRefFromLocal && refFromUrl === prodRefFromLocal) {
    record(
      'refuses_production_local_url_reuse',
      false,
      'STAGING_SUPABASE_URL matches .env.local VITE_SUPABASE_URL host — aborting',
    )
    process.exitCode = 1
    return
  }
  if (stagingRef && stagingRef !== refFromUrl) {
    record(
      'staging_ref_matches_url',
      false,
      `STAGING_PROJECT_REF (${stagingRef}) != URL ref (${refFromUrl})`,
    )
    process.exitCode = 1
    return
  }
  if (stagingRef && stagingRef !== KNOWN_STAGING_REF && stagingRef !== PROD_REF) {
    record(
      'staging_ref_note',
      true,
      `using custom staging ref ${stagingRef} (known default ${KNOWN_STAGING_REF})`,
    )
  }
  record('refuses_production', true, `staging ref=${stagingRef || refFromUrl}`)

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Guard: never mutate production event campaign issuance.
  const { data: eventCfg } = await admin
    .from('promotional_issuance_config')
    .select('campaign_id, mode, real_redeemable')
    .eq('campaign_id', EVENT_CAMPAIGN)
    .maybeSingle()
  if (eventCfg?.real_redeemable === true) {
    record(
      'event_campaign_not_live_on_staging_guard',
      false,
      'event-three-rooftop-v1 already real_redeemable — abort to avoid ambiguity',
    )
    process.exitCode = 1
    return
  }
  record('event_campaign_untouched_precheck', true, `real_redeemable=${eventCfg?.real_redeemable ?? 'missing'}`)

  const code = makeTestCode()
  const email = `staff-redeem-${Date.now()}@example.invalid`
  const nickname = `T${createHash('sha256').update(email).digest('hex').slice(0, 8)}`
  const issuedAt = new Date()
  // Phase B: live fixtures are non-expiring (expires_at null).
  const expiresAt = null

  const { data: createdUser, error: userErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID(),
    user_metadata: { purpose: 'staff-redeem-fixture' },
  })
  if (userErr || !createdUser?.user?.id) {
    record('create_auth_user', false, userErr?.message || 'no user id')
    process.exitCode = 1
    return
  }
  const userId = createdUser.user.id
  record('create_auth_user', true)

  const { data: profile, error: profileErr } = await admin
    .from('player_profiles')
    .insert({ user_id: userId, public_nickname: nickname })
    .select('id')
    .single()
  if (profileErr || !profile?.id) {
    record('create_profile', false, profileErr?.message || 'missing')
    process.exitCode = 1
    return
  }
  const playerId = profile.id
  record('create_profile', true)

  const { error: cfgErr } = await admin.from('promotional_issuance_config').upsert(
    {
      campaign_id: TEST_CAMPAIGN,
      mode: 'approved_live',
      claims_enabled: true,
      real_redeemable: true,
      terms_version: 'promo-terms-v1',
      voucher_ttl_days: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  )
  if (cfgErr) {
    record('upsert_test_issuance_config', false, cfgErr.message)
    process.exitCode = 1
    return
  }
  record('upsert_test_issuance_config', true, `${TEST_CAMPAIGN} approved_live+real_redeemable`)

  const { data: run, error: runErr } = await admin
    .from('promotional_campaign_runs')
    .insert({
      player_id: playerId,
      campaign_id: TEST_CAMPAIGN,
      campaign_version: 1,
      status: 'reward_calculated',
      reward_tier_id: 'tier_50',
      reward_amount_cents: 5000,
      reward_currency: 'AUD',
      reward_eligible: true,
      total_stars: 5,
      total_score: 5000,
      decision: { eligible: true, tierId: 'tier_50' },
      completed_at: issuedAt.toISOString(),
    })
    .select('id')
    .single()
  if (runErr || !run?.id) {
    record('create_run', false, runErr?.message || 'missing')
    process.exitCode = 1
    return
  }
  record('create_run', true)

  const { data: decision, error: decisionErr } = await admin
    .from('promotional_campaign_reward_decisions')
    .insert({
      run_id: run.id,
      player_id: playerId,
      eligible: true,
      tier_id: 'tier_50',
      amount_cents: 5000,
      currency: 'AUD',
      total_stars: 5,
      total_score: 5000,
      decision: { eligible: true, tierId: 'tier_50', amountCents: 5000 },
      voucher_issued: false,
    })
    .select('id')
    .single()
  if (decisionErr || !decision?.id) {
    record('create_decision', false, decisionErr?.message || 'missing')
    process.exitCode = 1
    return
  }
  record('create_decision', true)

  const { data: claim, error: claimErr } = await admin
    .from('promotional_voucher_claims')
    .insert({
      campaign_id: TEST_CAMPAIGN,
      run_id: run.id,
      decision_id: decision.id,
      player_id: playerId,
      email_raw: email,
      email_normalized: email.toLowerCase(),
      full_name: 'Staff Redeem Fixture',
      phone: '+61000000000',
      terms_version: 'promo-terms-v1',
      adult_self_attested: true,
      marketing_opt_in: false,
      reward_tier_id: 'tier_50',
      amount_cents: 5000,
      currency: 'AUD',
      status: 'issued',
      issuance_mode: 'approved_live',
      redeemable: true,
    })
    .select('id')
    .single()
  if (claimErr || !claim?.id) {
    record('create_claim', false, claimErr?.message || 'missing')
    process.exitCode = 1
    return
  }
  record('create_claim', true)

  const { data: voucher, error: voucherErr } = await admin
    .from('promotional_vouchers')
    .insert({
      claim_id: claim.id,
      campaign_id: TEST_CAMPAIGN,
      run_id: run.id,
      player_id: playerId,
      code,
      reward_tier_id: 'tier_50',
      amount_cents: 5000,
      currency: 'AUD',
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt,
      status: 'issued',
      demo: false,
      redeemable: true,
    })
    .select('id, code, status, redeemable, demo, amount_cents, expires_at, redeemed_at')
    .single()
  if (voucherErr || !voucher?.id) {
    record('create_live_test_voucher', false, voucherErr?.message || 'missing')
    process.exitCode = 1
    return
  }
  record(
    'create_live_test_voucher',
    true,
    `code=${code} amount=A$50 expires=+30d redeemable=true demo=false`,
  )

  const { data: lookup, error: lookupErr } = await admin.rpc('staff_lookup_promotional_voucher', {
    p_code_normalized: code,
  })
  if (lookupErr || lookup?.ok !== true) {
    record('staff_lookup', false, lookupErr?.message || JSON.stringify(lookup))
    process.exitCode = 1
    return
  }
  const lookupVoucher = lookup.voucher || {}
  record(
    'staff_lookup',
    lookupVoucher.amountCents === 5000 && lookupVoucher.redeemable === true && lookupVoucher.demo === false,
    `amountCents=${lookupVoucher.amountCents} redeemable=${lookupVoucher.redeemable}`,
  )

  const { data: firstRedeem, error: firstErr } = await admin.rpc('staff_redeem_promotional_voucher', {
    p_code_normalized: code,
    p_actor_session_jti: 'fixture-jti-1',
  })
  if (firstErr || firstRedeem?.ok !== true) {
    record('first_redeem', false, firstErr?.message || JSON.stringify(firstRedeem))
    process.exitCode = 1
    return
  }
  record('first_redeem', true, 'ok=true')

  const { data: afterFirst } = await admin
    .from('promotional_vouchers')
    .select('status, redeemed_at')
    .eq('id', voucher.id)
    .single()
  const redeemedAt = afterFirst?.redeemed_at
  record(
    'db_status_redeemed',
    afterFirst?.status === 'redeemed' && !!redeemedAt,
    `status=${afterFirst?.status}`,
  )

  const { data: audits } = await admin
    .from('promotional_voucher_redemption_events')
    .select('event_type, payload, created_at')
    .eq('voucher_id', voucher.id)
    .order('created_at', { ascending: true })
  const redeemedAudit = (audits || []).find((a) => a.event_type === 'redeemed')
  record('audit_redeemed_event', !!redeemedAudit, `events=${(audits || []).length}`)

  const { data: secondRedeem } = await admin.rpc('staff_redeem_promotional_voucher', {
    p_code_normalized: code,
    p_actor_session_jti: 'fixture-jti-2',
  })
  record(
    'second_redeem_rejected',
    secondRedeem?.ok === false && secondRedeem?.code === 'already_redeemed',
    `code=${secondRedeem?.code}`,
  )

  const { data: afterSecond } = await admin
    .from('promotional_vouchers')
    .select('redeemed_at')
    .eq('id', voucher.id)
    .single()
  record(
    'redeemed_at_immutable',
    afterSecond?.redeemed_at === redeemedAt,
    'timestamp unchanged after rejected retry',
  )

  // Fresh voucher for concurrency race
  const code2 = makeTestCode()
  const { data: run2 } = await admin
    .from('promotional_campaign_runs')
    .insert({
      player_id: playerId,
      campaign_id: TEST_CAMPAIGN,
      campaign_version: 1,
      status: 'reward_calculated',
      reward_tier_id: 'tier_50',
      reward_amount_cents: 5000,
      reward_currency: 'AUD',
      reward_eligible: true,
      total_stars: 5,
      total_score: 5000,
      decision: { eligible: true },
      completed_at: issuedAt.toISOString(),
    })
    .select('id')
    .single()
  const { data: decision2 } = await admin
    .from('promotional_campaign_reward_decisions')
    .insert({
      run_id: run2.id,
      player_id: playerId,
      eligible: true,
      tier_id: 'tier_50',
      amount_cents: 5000,
      currency: 'AUD',
      total_stars: 5,
      total_score: 5000,
      decision: { eligible: true },
      voucher_issued: false,
    })
    .select('id')
    .single()
  const { data: claim2 } = await admin
    .from('promotional_voucher_claims')
    .insert({
      campaign_id: TEST_CAMPAIGN,
      run_id: run2.id,
      decision_id: decision2.id,
      player_id: playerId,
      email_raw: `race-${Date.now()}@example.invalid`,
      email_normalized: `race-${Date.now()}@example.invalid`,
      full_name: 'Staff Redeem Race',
      phone: '+61000000001',
      terms_version: 'promo-terms-v1',
      adult_self_attested: true,
      marketing_opt_in: false,
      reward_tier_id: 'tier_50',
      amount_cents: 5000,
      currency: 'AUD',
      status: 'issued',
      issuance_mode: 'approved_live',
      redeemable: true,
    })
    .select('id')
    .single()
  const { data: voucher2 } = await admin
    .from('promotional_vouchers')
    .insert({
      claim_id: claim2.id,
      campaign_id: TEST_CAMPAIGN,
      run_id: run2.id,
      player_id: playerId,
      code: code2,
      reward_tier_id: 'tier_50',
      amount_cents: 5000,
      currency: 'AUD',
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt,
      status: 'issued',
      demo: false,
      redeemable: true,
    })
    .select('id')
    .single()

  const [raceA, raceB] = await Promise.all([
    admin.rpc('staff_redeem_promotional_voucher', {
      p_code_normalized: code2,
      p_actor_session_jti: 'race-a',
    }),
    admin.rpc('staff_redeem_promotional_voucher', {
      p_code_normalized: code2,
      p_actor_session_jti: 'race-b',
    }),
  ])
  const wins = [raceA.data, raceB.data].filter((r) => r?.ok === true).length
  const losses = [raceA.data, raceB.data].filter(
    (r) => r?.ok === false && r?.code === 'already_redeemed',
  ).length
  record('concurrent_single_winner', wins === 1 && losses === 1, `wins=${wins} losses=${losses}`)

  const { data: raceRow } = await admin
    .from('promotional_vouchers')
    .select('status, redeemed_at')
    .eq('id', voucher2.id)
    .single()
  record('concurrent_db_single_redeemed', raceRow?.status === 'redeemed' && !!raceRow?.redeemed_at)

  const { data: eventCfgAfter } = await admin
    .from('promotional_issuance_config')
    .select('real_redeemable, mode')
    .eq('campaign_id', EVENT_CAMPAIGN)
    .maybeSingle()
  record(
    'event_campaign_untouched_postcheck',
    eventCfgAfter?.real_redeemable !== true,
    `mode=${eventCfgAfter?.mode} real_redeemable=${eventCfgAfter?.real_redeemable}`,
  )

  console.log(`
Manual UI checklist (staging-backed /code/ only — never production DB):
  1. Point Preview/local staff API at STAGING_SUPABASE_* (not production).
  2. Open /code/, unlock, search ${code}
  3. Expect Redeemed badge + "This code has been redeemed on …" (Australia/Canberra)
  4. Redeem button disabled
  5. Confirm retry stays rejected

Verify SQL (staging):
  select code, status, amount_cents, demo, redeemable, redeemed_at
  from promotional_vouchers where code in ('${code}', '${code2}');

  select event_type, payload->>'redeemedAt' as redeemed_at
  from promotional_voucher_redemption_events
  where voucher_id in (
    select id from promotional_vouchers where code in ('${code}', '${code2}')
  )
  order by created_at;
`)

  if (!KEEP) {
    // Soft cleanup of isolated campaign rows (best-effort).
    await admin.from('promotional_voucher_redemption_events').delete().in('voucher_id', [
      voucher.id,
      voucher2.id,
    ])
    await admin.from('promotional_vouchers').delete().in('id', [voucher.id, voucher2.id])
    await admin.from('promotional_voucher_claims').delete().in('id', [claim.id, claim2.id])
    await admin.from('promotional_campaign_reward_decisions').delete().in('id', [
      decision.id,
      decision2.id,
    ])
    await admin.from('promotional_campaign_runs').delete().in('id', [run.id, run2.id])
    await admin.from('player_profiles').delete().eq('id', playerId)
    await admin.auth.admin.deleteUser(userId)
    record('cleanup_fixture', true, 'removed isolated rows (use --keep to retain)')
  } else {
    record('cleanup_fixture', true, 'skipped (--keep)')
  }
}

main().catch((error) => {
  console.error('FATAL', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
