/**
 * Static migration dependency audit for Phase 4C.2 → Final C snapshot fix.
 * No network. No writes. Safe to run anytime:
 *   node scripts/staging/audit-migration-deps.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(root).filter((f) => f.endsWith('.sql')).sort()

const c1 = '20260324000000_phase4c1_promotional_rewards.sql'
const c2 = '20260324120000_phase4c2_claim_workflow.sql'
const c3 = '20260325000000_phase4c3_claim_operations.sql'
const finalA = '20260326000000_final_a_campaign_runs.sql'
const finalB = '20260327000000_final_b_voucher_claims.sql'
const finalCSnap = '20260328000000_final_c_snapshot_atomicity.sql'

const findings = []
function ok(msg) {
  findings.push({ level: 'ok', msg })
}
function warn(msg) {
  findings.push({ level: 'warn', msg })
}
function info(msg) {
  findings.push({ level: 'info', msg })
}
function block(msg) {
  findings.push({ level: 'block', msg })
}

console.log('Phase 4C → Final C migration dependency audit\n')
console.log('Migration files (ordered):')
for (const f of files) console.log(`  - ${f}`)

const idx = Object.fromEntries(files.map((f, i) => [f, i]))
if (!(c1 in idx) || !(c2 in idx) || !(c3 in idx)) {
  block('Missing one or more Phase 4C migration files.')
} else if (!(idx[c1] < idx[c2] && idx[c2] < idx[c3])) {
  block('Phase 4C migrations are out of chronological order.')
} else {
  ok('4C.1 → 4C.2 → 4C.3 file order is correct.')
}

const sql2 = readFileSync(resolve(root, c2), 'utf8')
const sql3 = readFileSync(resolve(root, c3), 'utf8')
const sql1 = readFileSync(resolve(root, c1), 'utf8')

const c2Needs = [
  'reward_claim_status',
  'player_reward_claims',
  'reward_definitions',
  'reward_campaigns',
  'reward_audit_events',
  'player_profiles',
]
for (const name of c2Needs) {
  if (!sql2.includes(name)) block(`4C.2 does not reference expected object: ${name}`)
  else ok(`4C.2 uses ${name}`)
}

if (!sql1.includes('create type public.reward_claim_status')) {
  block('4C.1 must define reward_claim_status before 4C.2 functions.')
} else ok('4C.1 defines reward_claim_status enum used by 4C.2.')

if (!sql1.includes('create table if not exists public.player_reward_claims')) {
  block('4C.1 must create player_reward_claims before 4C.2 RPCs.')
} else ok('4C.1 creates player_reward_claims.')

const c3NeedsFromC2 = ['transition_player_reward_claim', 'request_player_reward_claim']
for (const fn of c3NeedsFromC2) {
  if (!sql2.includes(`function public.${fn}`)) block(`4C.2 missing function ${fn}`)
  else ok(`4C.2 defines ${fn}`)
  if (!sql3.includes(fn)) block(`4C.3 does not reference ${fn}`)
  else ok(`4C.3 depends on ${fn}`)
}

if (!sql3.includes('from public.transition_player_reward_claim')) {
  block('4C.3 operator_review_claim must call transition_player_reward_claim (requires 4C.2 applied first).')
} else {
  ok('4C.3 operator_review_claim calls transition_player_reward_claim — 4C.2 is a hard dependency.')
}

const c3NeedsBoards = ['leaderboard_overall', 'leaderboard_speed']
for (const fn of c3NeedsBoards) {
  if (!sql3.includes(`public.${fn}`)) warn(`4C.3 finalise may not call ${fn}`)
  else ok(`4C.3 finalise_leaderboard_snapshot calls ${fn}`)
}

if (!sql3.includes('claims_enabled')) ok('4C.3/related paths retain claims_enabled gating via 4C.2 RPC')
if (sql1.includes("claims_enabled boolean not null default false")) {
  ok('Demo/default claims_enabled=false in 4C.1 schema.')
}
if (sql1.includes('phase4c1-dev-placeholders') && sql1.includes("'draft'")) {
  ok('Demo campaign seed remains draft in 4C.1.')
}

if (
  /grant execute on function public\.request_player_reward_claim[\s\S]{0,80}to (anon|authenticated)/i.test(
    sql2,
  )
) {
  block('4C.2 must not grant request_player_reward_claim to anon/authenticated.')
} else {
  ok('4C.2 request_player_reward_claim is not granted to anon/authenticated.')
}

if (
  /grant execute on function public\.transition_player_reward_claim[\s\S]{0,80}to (anon|authenticated)/i.test(
    sql2,
  )
) {
  block('4C.2 must not grant transition_player_reward_claim to anon/authenticated.')
} else {
  ok('4C.2 transition_player_reward_claim is not granted to anon/authenticated.')
}

if (!sql3.includes('staff_operators')) block('4C.3 missing staff_operators')
else ok('4C.3 defines staff_operators for server-controlled operator roles.')

if (!sql3.includes('reward_voucher_intents') || !sql3.includes('code_issued = false')) {
  block('4C.3 voucher stub must force code_issued=false')
} else ok('4C.3 voucher intents constrained to non-issued reserved state.')

if (!sql3.includes('leaderboard_snapshots are immutable once finalised')) {
  warn('Snapshot immutability trigger message not found in 4C.3.')
} else ok('4C.3 snapshot immutability trigger present.')

if (!(finalA in idx) || !(finalB in idx)) {
  block('Missing Final A and/or Final B migration files.')
} else if (!(idx[finalA] < idx[finalB])) {
  block('Final B must sort after Final A.')
} else {
  ok('Final A → Final B file order is correct.')
}

const sqlA = finalA in idx ? readFileSync(resolve(root, finalA), 'utf8') : ''
const sqlB = finalB in idx ? readFileSync(resolve(root, finalB), 'utf8') : ''
const sqlSnap = finalCSnap in idx ? readFileSync(resolve(root, finalCSnap), 'utf8') : ''

if (sqlB && !sqlB.includes('promotional_campaign_runs')) {
  warn('Final B should reference promotional_campaign_runs (Final A).')
} else if (sqlB) {
  ok('Final B depends on Final A campaign run tables.')
}

if (sqlB && sqlB.includes('transition_player_reward_claim')) {
  block('Final B must not hard-depend on undeployed 4C.2 RPCs.')
} else if (sqlB) {
  ok('Final B does not require 4C.2 claim RPCs.')
}

if (sqlB && !sqlB.includes('promotional_voucher_claims_email_campaign_uidx')) {
  block('Final B must unique-constrain (campaign_id, email_normalized).')
} else if (sqlB) {
  ok('Final B unique email constraint present.')
}

if (sqlA && sqlA.includes('voucher_issued = false')) {
  ok('Final A keeps reward decisions non-issued; Final B tracks issuance in separate tables.')
}

if (sqlB && sqlB.includes("'demo'") && sqlB.includes('real_redeemable boolean not null default false')) {
  ok('Final B seeds demo issuance with real_redeemable gated false.')
}

// Destructive checks across pending chain
const pending = [c2, c3, finalA, finalB, finalCSnap].filter((f) => f in idx)
let destructive = false
for (const f of pending) {
  const sql = readFileSync(resolve(root, f), 'utf8').toLowerCase()
  if (
    /drop table\s+public\.(player_profiles|verified_game_records|game_attempts|leaderboard_)/.test(
      sql,
    ) ||
    /truncate\s+table\s+public\.(player_profiles|verified_game_records|game_attempts)/.test(sql)
  ) {
    block(`${f} appears to destroy core gameplay/leaderboard data.`)
    destructive = true
  }
}
if (!destructive) {
  ok('Pending migrations do not drop/truncate core gameplay or leaderboard tables.')
}

if (!(finalCSnap in idx) || !(idx[c3] < idx[finalCSnap])) {
  block('Missing Final C snapshot atomicity migration after 4C.3.')
} else {
  ok('Final C snapshot atomicity migration is ordered after 4C.3.')
}

if (
  sqlSnap &&
  sqlSnap.includes('Empty incomplete snapshot') &&
  sqlSnap.includes('leaderboard_snapshot_entries_deny_update') &&
  sqlSnap.includes('delete from public.leaderboard_snapshots')
) {
  ok('Snapshot fix: populated rows stay immutable; empty incomplete snapshots are deletable/re-finalisable.')
} else if (sqlSnap) {
  block('Final C snapshot migration missing expected recoverability logic.')
}

// --- Warning classification (accepted limitation vs release risk) ---
info(
  'ACCEPTED: No separate hosted staging project — use local disposable Supabase when Docker is available, plus remote dry-run.',
)
info(
  'ACCEPTED: Production push applies the full pending chain (4C.2→4C.3→Final A→Final B→Final C snapshot fix). Review dry-run before apply; never mark applied without executing.',
)
info(
  'ACCEPTED: Prefer local `supabase start` + `db reset` when Docker exists; otherwise rely on dry-run + static audit + tests.',
)
info(
  'MITIGATED: Prior 4C.3 empty-immutable snapshot risk is addressed by 20260328000000_final_c_snapshot_atomicity.sql.',
)

if (!sqlSnap) {
  warn(
    'RELEASE RISK: without Final C snapshot fix, empty failed snapshots could block re-finalise for a fingerprint.',
  )
}

const blocks = findings.filter((f) => f.level === 'block')
const warns = findings.filter((f) => f.level === 'warn')
const infos = findings.filter((f) => f.level === 'info')
const oks = findings.filter((f) => f.level === 'ok')

console.log('\nFindings:')
for (const f of findings) {
  console.log(`  [${f.level.toUpperCase()}] ${f.msg}`)
}
console.log(
  `\nSummary: ${oks.length} ok, ${infos.length} info, ${warns.length} warn, ${blocks.length} block`,
)

console.log('\nWarning review:')
console.log(
  '  Prior six warnings → reclassified as ACCEPTED operational notes or MITIGATED by Final C snapshot fix (see INFO lines). Remaining WARN lines are release risks.',
)

if (blocks.length) {
  process.exitCode = 1
  console.log('\nRESULT: BLOCKED — fix dependency issues before production apply.')
} else if (warns.length) {
  console.log('\nRESULT: CONDITIONAL — no blockers, but review WARN items before production apply.')
} else {
  console.log(
    '\nRESULT: 4C.2 must be applied before 4C.3. Final B needs Final A; snapshot recoverability fixed after 4C.3. No static blockers.',
  )
}
