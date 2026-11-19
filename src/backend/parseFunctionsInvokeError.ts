/**
 * Extract structured Edge Function error bodies from supabase.functions.invoke failures.
 * FunctionsHttpError.context is the raw Response (body readable once).
 */

import {
  CLAIM_ERROR_FALLBACK,
  CLAIM_NETWORK_ERROR,
  customerMessageForClaimError,
  parseClaimErrorPayload,
} from '../../shared/rewards/claimErrorMessages'

export type ParsedFunctionsInvokeError = Readonly<{
  code: string
  message: string
}>

function errorName(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const name = (error as { name?: unknown }).name
  return typeof name === 'string' ? name : ''
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return ''
}

async function readContextBody(context: unknown): Promise<unknown> {
  if (context == null) return null

  // Already-parsed JSON object (tests / alternate clients).
  if (typeof context === 'object' && !('json' in (context as object)) && !('text' in (context as object))) {
    return context
  }

  const maybeResponse = context as {
    json?: () => Promise<unknown>
    text?: () => Promise<string>
    clone?: () => { json?: () => Promise<unknown>; text?: () => Promise<string> }
  }

  const reader = typeof maybeResponse.clone === 'function' ? maybeResponse.clone() : maybeResponse

  if (typeof reader.json === 'function') {
    try {
      return await reader.json()
    } catch {
      // fall through to text
    }
  }

  if (typeof reader.text === 'function') {
    try {
      const text = await reader.text()
      if (!text) return null
      try {
        return JSON.parse(text) as unknown
      } catch {
        return { code: 'claim_failed', message: text }
      }
    } catch {
      return null
    }
  }

  return null
}

/**
 * Prefer structured Edge JSON on non-2xx; never return stack/SQL text to callers.
 */
export async function parseFunctionsInvokeError(
  error: unknown,
  data?: unknown,
): Promise<ParsedFunctionsInvokeError> {
  const fromData = parseClaimErrorPayload(data)
  if (fromData) return fromData

  const name = errorName(error)
  if (name === 'FunctionsFetchError') {
    return { code: 'network', message: CLAIM_NETWORK_ERROR }
  }
  if (name === 'FunctionsRelayError') {
    return {
      code: 'server_error',
      message: 'The voucher service is temporarily unavailable. Please try again shortly.',
    }
  }

  const context =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context: unknown }).context
      : undefined

  const body = await readContextBody(context)
  const parsed = parseClaimErrorPayload(body)
  if (parsed) return parsed

  const raw = errorMessage(error)
  if (/non-2xx|functionshttperror/i.test(raw)) {
    return { code: 'claim_failed', message: CLAIM_ERROR_FALLBACK }
  }
  if (/fetch|network|failed to send/i.test(raw)) {
    return { code: 'network', message: CLAIM_NETWORK_ERROR }
  }

  return {
    code: 'claim_failed',
    message: customerMessageForClaimError('claim_failed', null),
  }
}
