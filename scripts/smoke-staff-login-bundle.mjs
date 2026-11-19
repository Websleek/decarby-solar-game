/**
 * Vercel-compatible smoke: bundle api/staff/login.ts as CommonJS and invoke it.
 * Does not print secrets.
 *
 *   node scripts/smoke-staff-login-bundle.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.tmp-staff-api')
const outFile = join(outDir, 'login.cjs')
const buildScript = join(outDir, 'build.mjs')
mkdirSync(outDir, { recursive: true })

const require = createRequire(import.meta.url)
const { randomBytes, scryptSync } = require('crypto')

const password = 'Disposable-Smoke-Pass-2026!'
const N = 16384
const r = 8
const p = 1
const salt = randomBytes(16)
const digest = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 })
const encoded = [
  'scrypt',
  String(N),
  String(r),
  String(p),
  salt.toString('base64url'),
  digest.toString('base64url'),
].join(':')

process.env.STAFF_PASSWORD_HASH = encoded
process.env.STAFF_SESSION_SECRET = 's'.repeat(48)
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'smoke-service-role'

const entry = join(root, 'api/staff/login.ts').replace(/\\/g, '/')
const outfile = outFile.replace(/\\/g, '/')
writeFileSync(
  buildScript,
  `
import * as esbuild from 'esbuild'
await esbuild.build({
  entryPoints: [${JSON.stringify(entry)}],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: ${JSON.stringify(outfile)},
  external: ['@supabase/supabase-js'],
})
console.log('bundled')
`,
)

const install = spawnSync('npm', ['install', '--no-save', 'esbuild@0.25.0'], {
  encoding: 'utf8',
  cwd: outDir,
  shell: true,
})
if (install.status !== 0) {
  console.error('esbuild install failed')
  console.error(install.stderr || install.stdout)
  process.exit(1)
}

const build = spawnSync(process.execPath, [buildScript], {
  encoding: 'utf8',
  cwd: outDir,
})
if (build.status !== 0) {
  console.error('esbuild failed')
  console.error(build.stderr || build.stdout)
  process.exit(1)
}

const bundled = readFileSync(outFile, 'utf8')
if (!bundled.includes('exports.') && !bundled.includes('module.exports')) {
  console.error('bundle does not look like CommonJS')
  process.exit(1)
}

const Module = require('module')
const originalLoad = Module._load
Module._load = function patched(request, parent, isMain) {
  if (request === '@supabase/supabase-js') {
    return {
      createClient() {
        return {
          from() {
            return {
              select() {
                return {
                  eq() {
                    return { maybeSingle: async () => ({ data: null }) }
                  },
                }
              },
              upsert: async () => ({ data: null, error: null }),
              delete() {
                return { eq: async () => ({ error: null }) }
              },
            }
          },
        }
      },
    }
  }
  return originalLoad(request, parent, isMain)
}

const handler = require(outFile).default
if (typeof handler !== 'function') {
  console.error('bundle did not export default function')
  process.exit(1)
}

function mockRes() {
  const state = { statusCode: 200, headers: {}, body: null, headersSent: false }
  return {
    state,
    status(code) {
      state.statusCode = code
      return this
    },
    setHeader(k, v) {
      state.headers[String(k).toLowerCase()] = v
    },
    json(body) {
      state.headersSent = true
      state.body = body
    },
  }
}

async function invoke(passwordValue) {
  const res = mockRes()
  await handler(
    {
      method: 'POST',
      headers: { host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1' },
      body: { password: passwordValue },
      socket: { remoteAddress: '127.0.0.1' },
    },
    res,
  )
  return res.state
}

const ok = await invoke(password)
const bad = await invoke('nope')

const report = {
  okStatus: ok.statusCode,
  okAuthenticated: ok.body?.authenticated === true,
  okHasCookie: Boolean(ok.headers['set-cookie']),
  badStatus: bad.statusCode,
  badCode: bad.body?.code,
  hashFormat: encoded.startsWith('scrypt:') ? 'colon' : 'other',
}

if (!(ok.statusCode === 200 && ok.body?.ok === true && bad.statusCode === 401 && bad.body?.code === 'invalid_password')) {
  console.error('SMOKE_FAIL', JSON.stringify(report))
  process.exit(1)
}

console.log('SMOKE_OK', JSON.stringify(report))
void pathToFileURL
