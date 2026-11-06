export type BackendConfig = Readonly<{
  url: string
  anonKey: string
}>

export type BackendConnectionStatus =
  | 'not_configured'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'error'

function trimOrEmpty(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Reads Vite publishable env vars. Never reads service-role secrets. */
export function readBackendConfig(
  env: Pick<ImportMetaEnv, 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'> = import.meta.env,
): BackendConfig | null {
  const url = trimOrEmpty(env.VITE_SUPABASE_URL)
  const anonKey = trimOrEmpty(env.VITE_SUPABASE_ANON_KEY)

  if (!url || !anonKey) return null
  if (url.includes('YOUR_PROJECT_REF') || anonKey.includes('YOUR_PUBLISHABLE')) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return null
    }
  } catch {
    return null
  }

  return { url, anonKey }
}

export function isBackendConfigured(
  env?: Pick<ImportMetaEnv, 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'>,
): boolean {
  return readBackendConfig(env) !== null
}
