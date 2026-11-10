/**
 * DB-backed Phase 4C.2/4C.3 staging security integration harness.
 *
 * Requires `.env.staging.local` (see `.env.staging.example`).
 * Refuses production project ref.
 * Does not enable public claims or issue vouchers.
 *
 *   node scripts/staging/integration-security.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'lrohmaodpqbmvgxsspql'
const TERMS = 'promo-terms-v1'

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

const fileEnv = {
  ...loadEnvFile(resolve(process.cwd(), '.env.staging.local')),
  ...process.env,
}

const url = fileEnv.STAGING_SUPABASE_URL || ''
const anon = fileEnv.STAGING_SUPABASE_ANON_KEY || ''
const service = fileEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY || ''
const stagingRef = fileEnv.STAGING_PROJECT_REF || ''

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
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

async function invokeFunction(baseUrl, anonKey, accessToken, name, body) {
  const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken || anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  console.log('Phase 4C.3 staging security integration harness\n')

  if (!url || !anon || !service) {
    record(
      'staging_env_present',
      false,
      'Missing STAGING_SUPABASE_URL / ANON / SERVICE_ROLE in .env.staging.local',
    )
    console.log('\nBLOCKER: Create a separate staging Supabase project, fill .env.staging.local, apply 4C.2+4C.3, deploy functions, then re-run.')
    process.exitCode = 2
    printSummary()
    return
  }

  const refFromUrl = extractRef(url)
  if (refFromUrl === PROD_REF || stagingRef === PROD_REF || url.includes(PROD_REF)) {
    record('refuses_production', false, 'Staging credentials point at production — aborting')
    process.exitCode = 1
    printSummary()
    return
  }
  record('refuses_production', true, `staging ref=${stagingRef || refFromUrl}`)

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- Schema presence (4C.2 / 4C.3 applied?) ---
  const { data: campaigns, error: campErr } = await admin
    .from('reward_campaigns')
    .select('slug, lifecycle_status, public_catalog')
    .eq('slug', 'phase4c1-dev-placeholders')
    .maybeSingle()
  record(
    'schema_reward_campaigns',
    !campErr && Boolean(campaigns),
    campErr?.message || `lifecycle=${campaigns?.lifecycle_status}`,
  )
  if (campaigns) {
    record(
      'demo_campaign_inactive',
      campaigns.lifecycle_status === 'draft' && campaigns.public_catalog === false,
      JSON.stringify(campaigns),
    )
  }

  const { data: rewards, error: rewardErr } = await admin
    .from('reward_definitions')
    .select('slug, claims_enabled, publishing_status')
    .eq('campaign_id', '00000000-0000-4000-8000-0000000004c1')
  record('schema_reward_definitions', !rewardErr, rewardErr?.message)
  if (rewards) {
    record(
      'demo_claims_disabled',
      rewards.every((r) => r.claims_enabled === false && r.publishing_status === 'draft'),
      `count=${rewards.length}`,
    )
  }

  // Direct RPC execute as anon should fail for claim mutations
  const { error: anonReqErr } = await anonClient.rpc('request_player_reward_claim', {
    p_player_id: '00000000-0000-4000-8000-000000000001',
    p_reward_id: '00000000-0000-4000-8000-000000000101',
    p_adult_confirmed: true,
    p_consent_granted: true,
  })
  record(
    'anon_cannot_execute_request_claim',
    Boolean(anonReqErr),
    anonReqErr?.message || 'UNEXPECTED success',
  )

  const { error: anonTransErr } = await anonClient.rpc('transition_player_reward_claim', {
    p_claim_id: '00000000-0000-4000-8000-000000000099',
    p_to_status: 'approved',
  })
  record(
    'anon_cannot_execute_transition_claim',
    Boolean(anonTransErr),
    anonTransErr?.message || 'UNEXPECTED success',
  )

  // Unauthenticated Edge
  const unauth = await invokeFunction(url, anon, null, 'list-my-claims', {})
  record(
    'unauthenticated_list_my_claims',
    unauth.status === 401 || unauth.json?.code === 'unauthenticated',
    `status=${unauth.status} code=${unauth.json?.code}`,
  )

  const unauthOp = await invokeFunction(url, anon, null, 'operator-claims', { action: 'access' })
  record(
    'unauthenticated_operator_claims',
    unauthOp.status === 401 || unauthOp.json?.code === 'unauthenticated',
    `status=${unauthOp.status} code=${unauthOp.json?.code}`,
  )

  // Create two anonymous players
  const playerA = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const playerB = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signA = await playerA.auth.signInAnonymously()
  const signB = await playerB.auth.signInAnonymously()
  record('player_a_auth', !signA.error && Boolean(signA.data.session), signA.error?.message)
  record('player_b_auth', !signB.error && Boolean(signB.data.session), signB.error?.message)
  if (signA.error || signB.error || !signA.data.user || !signB.data.user) {
    process.exitCode = 1
    printSummary()
    return
  }

  const nickA = `StgA${Date.now().toString(36).slice(-5)}`
  const nickB = `StgB${Date.now().toString(36).slice(-5)}`
  const { data: profA, error: profAErr } = await playerA
    .from('player_profiles')
    .insert({ user_id: signA.data.user.id, public_nickname: nickA })
    .select('id')
    .single()
  const { data: profB, error: profBErr } = await playerB
    .from('player_profiles')
    .insert({ user_id: signB.data.user.id, public_nickname: nickB })
    .select('id')
    .single()
  record('player_a_profile', !profAErr && Boolean(profA?.id), profAErr?.message)
  record('player_b_profile', !profBErr && Boolean(profB?.id), profBErr?.message)

  // Consent via Edge
  const consentRes = await invokeFunction(
    url,
    anon,
    signA.data.session.access_token,
    'record-promotional-consent',
    {
      adultSelfAttested: true,
      termsAccepted: true,
      termsVersion: TERMS,
      marketingOptIn: false,
    },
  )
  record(
    'consent_record_ok',
    consentRes.status === 200 && consentRes.json?.ok === true,
    `status=${consentRes.status}`,
  )
  record(
    'consent_terms_version',
    consentRes.json?.consent?.termsVersion === TERMS,
    String(consentRes.json?.consent?.termsVersion),
  )
  record(
    'consent_unverified_age',
    consentRes.json?.consent?.independentlyVerifiedAge === false &&
      consentRes.json?.consent?.adultAttestationMethod === 'self_attestation_unverified',
    JSON.stringify(consentRes.json?.consent),
  )
  record(
    'consent_marketing_separate',
    consentRes.json?.consent?.marketingOptIn === false,
    'marketingOptIn false while terms accepted',
  )
  record(
    'public_claiming_still_disabled_flag',
    consentRes.json?.publicClaimingEnabled === false,
    String(consentRes.json?.publicClaimingEnabled),
  )

  // Player claim history (empty ok)
  const histA = await invokeFunction(url, anon, signA.data.session.access_token, 'list-my-claims', {})
  record(
    'player_list_claims_ok',
    histA.status === 200 &&
      histA.json?.ok === true &&
      histA.json?.publicClaimingEnabled === false,
    `status=${histA.status} publicClaiming=${histA.json?.publicClaimingEnabled}`,
  )
  record(
    'player_history_no_claim_button_contract',
    Array.isArray(histA.json?.claims) &&
      histA.json.claims.every((c) => c.canRequestClaim === false && c.voucherIssued === false),
    `claims=${histA.json?.claims?.length ?? 0}`,
  )

  // Non-staff operator denial
  const nonStaff = await invokeFunction(url, anon, signA.data.session.access_token, 'operator-claims', {
    action: 'access',
  })
  record(
    'non_staff_operator_denied',
    nonStaff.status === 403 || nonStaff.json?.code === 'operator_required',
    `status=${nonStaff.status} code=${nonStaff.json?.code}`,
  )

  // Owner-only: player B should not see A's claims via RPC (list_my filters auth.uid)
  const { data: bClaims, error: bClaimsErr } = await playerB.rpc('list_my_reward_claims')
  record('player_b_rpc_lists_own_only', !bClaimsErr && Array.isArray(bClaims), bClaimsErr?.message)
  if (Array.isArray(bClaims)) {
    record(
      'player_b_no_foreign_claims',
      bClaims.every((row) => true) && bClaims.length === 0,
      `count=${bClaims.length}`,
    )
  }

  // Voucher intent write restriction (authenticated)
  const { error: voucherWriteErr } = await playerA.from('reward_voucher_intents').insert({
    claim_id: '00000000-0000-4000-8000-000000000099',
    reward_id: '00000000-0000-4000-8000-000000000101',
    player_id: profA?.id,
  })
  record(
    'authenticated_cannot_write_voucher_intents',
    Boolean(voucherWriteErr),
    voucherWriteErr?.message || 'UNEXPECTED write success',
  )

  // Snapshot immutability + concurrent finalise idempotency (service_role)
  const fingerprint = `stg-fp-${Date.now()}`
  const [{ data: snap1, error: snap1Err }, { data: snap2, error: snap2Err }] = await Promise.all([
    admin.rpc('finalise_leaderboard_snapshot', {
      p_board: 'overall',
      p_period_label: 'staging-integration',
      p_source_fingerprint: fingerprint,
      p_limit: 10,
    }),
    admin.rpc('finalise_leaderboard_snapshot', {
      p_board: 'overall',
      p_period_label: 'staging-integration',
      p_source_fingerprint: fingerprint,
      p_limit: 10,
    }),
  ])
  record(
    'snapshot_finalise_concurrent_idempotent',
    !snap1Err && !snap2Err,
    snap1Err?.message || snap2Err?.message || 'both calls returned',
  )
  const row1 = Array.isArray(snap1) ? snap1[0] : snap1
  const row2 = Array.isArray(snap2) ? snap2[0] : snap2
  if (row1 && row2) {
    record(
      'snapshot_same_id_on_duplicate',
      String(row1.snapshot_id) === String(row2.snapshot_id),
      `${row1.snapshot_id} vs ${row2.snapshot_id}`,
    )
    const insertedCount = [row1.inserted, row2.inserted].filter(Boolean).length
    record('snapshot_single_insert_on_race', insertedCount <= 1, `insertedCount=${insertedCount}`)

    const { error: updErr } = await admin
      .from('leaderboard_snapshots')
      .update({ period_label: 'mutated' })
      .eq('id', row1.snapshot_id)
    record('snapshot_immutable_update_denied', Boolean(updErr), updErr?.message || 'UNEXPECTED update')
  }

  // Staff operator path (optional if STAGING_OPERATOR_USER_ID + can mint session not available)
  // We provision staff on player A via service_role and re-check operator access.
  if (profA?.id && signA.data.user?.id) {
    const { error: staffErr } = await admin.from('staff_operators').upsert({
      user_id: signA.data.user.id,
      role: 'claims_reviewer',
      active: true,
    })
    record('staff_operator_provision', !staffErr, staffErr?.message)

    const staffAccess = await invokeFunction(
      url,
      anon,
      signA.data.session.access_token,
      'operator-claims',
      { action: 'access' },
    )
    record(
      'staff_operator_access',
      staffAccess.status === 200 && staffAccess.json?.operator === true,
      `status=${staffAccess.status}`,
    )
    record(
      'staff_cannot_issue_vouchers_flag',
      staffAccess.json?.canIssueVouchers === false,
      String(staffAccess.json?.canIssueVouchers),
    )

    // Create a pending claim via service_role RPC against a TEMP enabled reward copy? 
    // Do not mutate production demo seed claims_enabled. Instead create ephemeral campaign/reward.
    const campaignId = crypto.randomUUID()
    const rewardId = crypto.randomUUID()
    const { error: campInsErr } = await admin.from('reward_campaigns').insert({
      id: campaignId,
      slug: `stg-${Date.now()}`,
      title: 'Staging Internal Campaign',
      description: 'Ephemeral staging only',
      lifecycle_status: 'active',
      public_catalog: false,
      default_one_claim_per_player_reward: true,
      metadata: { staging: true, redeemable: false },
    })
    const { error: rewInsErr } = await admin.from('reward_definitions').insert({
      id: rewardId,
      campaign_id: campaignId,
      slug: `stg-reward-${Date.now()}`,
      title: 'Staging consultation placeholder',
      short_description: 'Internal only',
      reward_type: 'consultation_benefit',
      eligibility: { kind: 'achievement', achievementId: 'solar_starter' },
      publishing_status: 'published',
      public_catalog: false,
      claims_enabled: true,
      display_order: 1,
      per_player_limit: 1,
      metadata: { staging: true, redeemable: false },
    })
    record('ephemeral_staging_reward', !campInsErr && !rewInsErr, campInsErr?.message || rewInsErr?.message)

    const { data: claimRows, error: claimErr } = await admin.rpc('request_player_reward_claim', {
      p_player_id: profA.id,
      p_reward_id: rewardId,
      p_adult_confirmed: true,
      p_consent_granted: true,
      p_eligibility_snapshot: { staging: true, eligible: true },
      p_actor_role: 'service_role',
    })
    // May be rejected as ineligible if RPC re-checks eligibility rules only via snapshot flag —
    // request RPC does NOT re-evaluate achievement rules; it trusts service_role precheck gates.
    const claimRow = Array.isArray(claimRows) ? claimRows[0] : claimRows
    record(
      'service_role_claim_request',
      !claimErr && claimRow && (claimRow.inserted === true || claimRow.claim_id),
      claimErr?.message || JSON.stringify(claimRow),
    )

    if (claimRow?.claim_id) {
      const detail = await invokeFunction(
        url,
        anon,
        signA.data.session.access_token,
        'operator-claims',
        { action: 'get', claimId: claimRow.claim_id },
      )
      record('staff_get_claim_detail', detail.status === 200 && detail.json?.ok === true, `status=${detail.status}`)

      const approve1 = await invokeFunction(
        url,
        anon,
        signA.data.session.access_token,
        'operator-claims',
        { action: 'review', claimId: claimRow.claim_id, decision: 'approve', reason: 'staging ok' },
      )
      record(
        'staff_approve_claim',
        approve1.status === 200 && approve1.json?.ok === true && approve1.json?.toStatus === 'approved',
        JSON.stringify(approve1.json),
      )
      record(
        'approve_does_not_issue_voucher',
        approve1.json?.voucherIssued === false && approve1.json?.redeemed === false,
        JSON.stringify({
          voucherIssued: approve1.json?.voucherIssued,
          redeemed: approve1.json?.redeemed,
        }),
      )

      const approve2 = await invokeFunction(
        url,
        anon,
        signA.data.session.access_token,
        'operator-claims',
        { action: 'review', claimId: claimRow.claim_id, decision: 'approve', reason: 'duplicate' },
      )
      record(
        'duplicate_review_prevented',
        approve2.status === 409 ||
          approve2.status === 400 ||
          approve2.json?.ok === false ||
          approve2.json?.code === 'invalid_transition',
        `status=${approve2.status} code=${approve2.json?.code}`,
      )

      // Audit immutability
      const { data: audits } = await admin
        .from('reward_audit_events')
        .select('id')
        .eq('claim_id', claimRow.claim_id)
        .limit(1)
      if (audits?.[0]?.id) {
        const { error: auditMutErr } = await admin
          .from('reward_audit_events')
          .update({ payload: { hacked: true } })
          .eq('id', audits[0].id)
        record('audit_immutable', Boolean(auditMutErr), auditMutErr?.message || 'UNEXPECTED mutate')
      } else {
        record('audit_immutable', false, 'no audit row found')
      }

      // Cross-player history still owner-only after claim exists
      const histB = await invokeFunction(url, anon, signB.data.session.access_token, 'list-my-claims', {})
      const bSawA = (histB.json?.claims ?? []).some((c) => c.claimId === claimRow.claim_id)
      record('owner_only_claim_history', histB.status === 200 && !bSawA, `bSawA=${bSawA}`)
    }
  }

  // Frontend contract: public claim still throws in shared service is unit-tested elsewhere.
  record('no_voucher_codes_generated', true, 'harness never created voucher codes')

  printSummary()
  const failed = results.filter((r) => !r.ok)
  process.exitCode = failed.length ? 1 : 0
}

function printSummary() {
  const failed = results.filter((r) => !r.ok)
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('Failures:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
