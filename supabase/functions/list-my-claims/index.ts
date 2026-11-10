import { loadActiveProfile, requireAuthenticatedUser } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { clientKey, takeRateToken } from '../_shared/rateLimit.ts'

/**
 * Authenticated player claim history (read-only, owner-scoped).
 * Does not expose audit rows, eligibility evidence dumps, or other players' claims.
 * Public claim creation remains disabled.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  if (!takeRateToken(`list-my-claims:${clientKey(req)}`, { max: 20 })) {
    return publicError(429, 'rate_limited', 'Too many claim history requests. Try again shortly.')
  }

  try {
    const auth = await requireAuthenticatedUser(req)
    if ('error' in auth) {
      return publicError(401, 'unauthenticated', 'Sign in to view your claim history.')
    }

    const profile = await loadActiveProfile(auth.admin, auth.user.id)
    if (!profile) {
      return publicError(403, 'profile_required', 'An active online profile is required.')
    }

    const { data, error } = await auth.userClient.rpc('list_my_reward_claims')
    if (error) {
      console.error('list_my_reward_claims failed', error)
      return publicError(500, 'list_failed', 'Could not load claim history.')
    }

    const claims = (Array.isArray(data) ? data : []).map((row) => {
      const r = row as Record<string, unknown>
      return {
        claimId: String(r.claim_id),
        rewardId: String(r.reward_id),
        rewardSlug: String(r.reward_slug ?? ''),
        rewardTitle: String(r.reward_title ?? ''),
        campaignId: String(r.campaign_id),
        status: String(r.status),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
        decidedAt: r.decided_at == null ? null : String(r.decided_at),
        // Explicitly non-actionable while public claiming is disabled.
        canRequestClaim: false,
        voucherIssued: false,
      }
    })

    return jsonResponse({
      ok: true,
      claims,
      publicClaimingEnabled: false,
    })
  } catch (error) {
    console.error('list-my-claims failed', error)
    return publicError(500, 'server_error', 'Could not load claim history.')
  }
})
