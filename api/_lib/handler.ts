import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json } from './http'

/** Wrap staff API handlers so unexpected throws become controlled JSON, not FUNCTION_INVOCATION_FAILED. */
export function withStaffApiHandler(
  name: string,
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      const detail = error instanceof Error ? error.name : 'unknown'
      console.error(`staff_api:${name}:unhandled`, detail)
      if (!res.headersSent) {
        json(res, 500, {
          ok: false,
          code: 'server_error',
          message: 'Could not complete the staff request. Try again shortly.',
        })
      }
    }
  }
}
