/**
 * Generate STAFF_PASSWORD_HASH for Vercel env (never commit plaintext).
 *
 * Usage:
 *   npm run staff:hash-password -- "your-password"
 *   node scripts/hash-staff-password.mjs "your-password"
 *
 * stdout: ONE line — the hash only (safe to paste into Vercel).
 * stderr: human instructions.
 *
 * Format uses ':' separators (env-safe). Do NOT use legacy '$' hashes in env vars —
 * many loaders expand $NAME and silently corrupt the value.
 */
import { scryptSync, randomBytes } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: npm run staff:hash-password -- "<password>"')
  process.exit(1)
}

const N = 16384
const r = 8
const p = 1
const salt = randomBytes(16)
const hash = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 })
const encoded = [
  'scrypt',
  String(N),
  String(r),
  String(p),
  salt.toString('base64url'),
  hash.toString('base64url'),
].join(':')

// Hash only on stdout so copy/paste cannot include instructions.
process.stdout.write(`${encoded}\n`)

console.error('')
console.error('Copy the single line above into Vercel → Settings → Environment Variables.')
console.error('Name: STAFF_PASSWORD_HASH')
console.error('Environments: Production (and Preview if needed).')
console.error('Paste the hash only — no quotes, no extra lines.')
console.error('Redeploy after saving. Also ensure STAFF_SESSION_SECRET is 32+ characters.')
console.error('Format: scrypt:N:r:p:salt:hash  (colon-separated; not dollar-separated)')
