/**
 * Smoke-test anonymous auth + nickname against hosted Supabase using .env.local.
 * Does not print secrets.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

function summarizeKey(key) {
  if (!key) return { present: false }
  return {
    present: true,
    length: key.length,
    prefix: key.slice(0, 14),
    suffix: key.slice(-4),
    looksPublishable: key.startsWith('sb_publishable_') || key.startsWith('eyJ'),
  }
}

const env = loadEnvLocal()
const url = env.VITE_SUPABASE_URL ?? ''
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? ''

const urlHost = (() => {
  try {
    return new URL(url).host
  } catch {
    return null
  }
})()

console.log(
  JSON.stringify({
    step: 'env_check',
    urlHost,
    matchesLinkedProject: urlHost === 'lrohmaodpqbmvgxsspql.supabase.co',
    anonKey: summarizeKey(anonKey),
  }),
)

if (!urlHost || !anonKey) {
  console.log(JSON.stringify({ step: 'abort', reason: 'missing_credentials' }))
  process.exit(0)
}

const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const results = []

try {
  const { data, error } = await client.auth.signInAnonymously()
  results.push({
    step: 'anonymous_sign_in',
    ok: !error && !!data.session?.user?.id,
    isAnonymous: data.user?.is_anonymous === true,
    error: error?.message ?? null,
  })

  if (error || !data.session?.user) {
    console.log(JSON.stringify({ results }))
    process.exit(1)
  }

  const userId = data.session.user.id
  const nickname = `QARoof${Date.now().toString().slice(-6)}`

  const insert = await client
    .from('player_profiles')
    .insert({ user_id: userId, public_nickname: nickname })
    .select('id, public_nickname, moderation_status, user_id')
    .single()

  results.push({
    step: 'nickname_create',
    ok: !insert.error && insert.data?.public_nickname === nickname,
    error: insert.error?.message ?? null,
    returnedUserId: insert.data?.user_id === userId,
    moderationStatus: insert.data?.moderation_status ?? null,
  })

  const reload = await client
    .from('player_profiles')
    .select('public_nickname')
    .eq('user_id', userId)
    .maybeSingle()

  results.push({
    step: 'nickname_persist',
    ok: !reload.error && reload.data?.public_nickname === nickname,
    error: reload.error?.message ?? null,
  })

  const publicView = await client
    .from('public_player_profiles')
    .select('id, public_nickname')
    .eq('public_nickname', nickname)
    .maybeSingle()

  results.push({
    step: 'public_view_active_only',
    ok: !publicView.error,
    seesOwnActiveNickname: publicView.data?.public_nickname === nickname,
    error: publicView.error?.message ?? null,
  })

  await client.auth.signOut()
  results.push({ step: 'sign_out', ok: true })
} catch (error) {
  results.push({
    step: 'exception',
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  })
}

console.log(JSON.stringify({ results }, null, 2))
const failed = results.some((r) => r.ok === false)
process.exit(failed ? 1 : 0)
