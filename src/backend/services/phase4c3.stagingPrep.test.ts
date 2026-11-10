import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('phase 4C.3 staging release readiness prep', () => {
  it('ships staging env example without production secrets', () => {
    expect(existsSync(resolve(process.cwd(), '.env.staging.example'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'scripts/staging/cli-runbook.mjs'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'scripts/staging/integration-security.mjs'))).toBe(
      true,
    )
  })

  it('passes static migration dependency audit (4C.2 before 4C.3)', () => {
    const output = execFileSync(process.execPath, ['scripts/staging/audit-migration-deps.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
    expect(output).toContain('4C.2 must be applied before 4C.3')
    expect(output).not.toMatch(/\[BLOCK\]/)
  })

  it('integration harness exits with blocker when staging env is absent', () => {
    try {
      execFileSync(process.execPath, ['scripts/staging/integration-security.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          STAGING_SUPABASE_URL: '',
          STAGING_SUPABASE_ANON_KEY: '',
          STAGING_SUPABASE_SERVICE_ROLE_KEY: '',
          STAGING_PROJECT_REF: '',
        },
      })
      throw new Error('expected non-zero exit')
    } catch (error) {
      const err = error as { status?: number; stdout?: string }
      expect(err.status).toBe(2)
      expect(String(err.stdout ?? '')).toMatch(/Missing STAGING_SUPABASE/)
    }
  })
})
