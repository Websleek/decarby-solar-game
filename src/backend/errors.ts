export type BackendErrorCode =
  | 'not_configured'
  | 'offline'
  | 'unauthenticated'
  | 'unauthorized'
  | 'validation'
  | 'conflict'
  | 'unsupported'
  | 'network'
  | 'unknown'

export class BackendError extends Error {
  readonly code: BackendErrorCode
  readonly cause?: unknown

  constructor(code: BackendErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    this.cause = cause
  }
}

export function isBackendError(value: unknown): value is BackendError {
  return value instanceof BackendError
}

export function toBackendError(error: unknown, fallback = 'Backend request failed'): BackendError {
  if (isBackendError(error)) return error
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('fetch') || message.includes('network')) {
      return new BackendError('network', 'Could not reach the online service.', error)
    }
    return new BackendError('unknown', error.message || fallback, error)
  }
  return new BackendError('unknown', fallback, error)
}
