import { describe, expect, it } from 'vitest'
import { isBackendConfigured, readBackendConfig } from './config'

describe('backend config', () => {
  it('treats missing env as local-only', () => {
    expect(readBackendConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' })).toBeNull()
    expect(isBackendConfigured({ VITE_SUPABASE_URL: undefined, VITE_SUPABASE_ANON_KEY: undefined })).toBe(
      false,
    )
  })

  it('rejects placeholder credentials', () => {
    expect(
      readBackendConfig({
        VITE_SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'YOUR_PUBLISHABLE_ANON_KEY',
      }),
    ).toBeNull()
  })

  it('accepts https project URL with anon key', () => {
    const config = readBackendConfig({
      VITE_SUPABASE_URL: 'https://abcd1234.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    })
    expect(config).toEqual({
      url: 'https://abcd1234.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    })
    expect(isBackendConfigured({
      VITE_SUPABASE_URL: 'https://abcd1234.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    })).toBe(true)
  })

  it('allows localhost http for local Supabase CLI', () => {
    expect(
      readBackendConfig({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: 'local-anon-key',
      }),
    ).not.toBeNull()
  })
})
