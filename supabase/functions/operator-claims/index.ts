import {
  isStaffOperator,
  loadActiveProfile,
  requireAuthenticatedUser,
} from '../_shared/auth.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { clientKey, takeRateToken } from '../_shared/rateLimit.ts'
import { approvalDoesNotIssueVoucher } from '../_shared/rewards/voucherPrep.ts'

type Action = 'access' | 'list_pending' | 'get' | 'review'

/**
 * Staff-only claim review API.
 * Operator role comes from staff_operators (DB), never from client-supplied role labels.
 * Approve means reviewed/approved only — never voucher issued or redeemed.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  if (!takeRateToken(`operator-claims:${clientKey(req)}`, { max: 40 })) {
    return publicError(429, 'rate_limited', 'Too many operator requests. Try again shortly.')
  }

  try {
    const auth = await requireAuthenticatedUser(req)
    if ('error' in auth) {
      return publicError(401, 'unauthenticated', 'Sign in required for operator tools.')
    }

    const staff = await isStaffOperator(auth.admin, auth.user.id)
    if (!staff) {
      return publicError(403, 'operator_required', 'Authorised staff operator role required.')
    }

    // Profile optional for access check; still useful for audit context.
    const profile = await loadActiveProfile(auth.admin, auth.user.id)

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown
      claimId?: unknown
      decision?: unknown
      reason?: unknown
      limit?: unknown
    }

    const action = body.action as Action
    if (
      action !== 'access' &&
      action !== 'list_pending' &&
      action !== 'get' &&
      action !== 'review'
    ) {
      return publicError(
        400,
        'invalid_request',
        'action must be access, list_pending, get, or review.',
      )
    }

    if (action === 'access') {
      return jsonResponse({
        ok: true,
        operator: true,
        operatorUserId: auth.user.id,
        profileId: profile?.id ?? null,
        canIssueVouchers: false,
        canRedeem: false,
      })
    }

    if (action === 'list_pending') {
      const limit =
        typeof body.limit === 'number' && Number.isFinite(body.limit)
          ? Math.min(Math.max(Math.trunc(body.limit), 1), 100)
          : 50
      const { data, error } = await auth.userClient.rpc('operator_list_pending_claims', {
        p_limit: limit,
      })
      if (error) {
        console.error('operator_list_pending_claims failed', error)
        return publicError(500, 'list_failed', 'Could not load pending claims.')
      }
      const claims = (Array.isArray(data) ? data : []).map((row) => {
        const r = row as Record<string, unknown>
        return {
          claimId: String(r.claim_id),
          playerId: String(r.player_id),
          publicNickname: String(r.public_nickname ?? ''),
          rewardId: String(r.reward_id),
          rewardSlug: String(r.reward_slug ?? ''),
          rewardTitle: String(r.reward_title ?? ''),
          campaignId: String(r.campaign_id),
          status: String(r.status),
          createdAt: String(r.created_at),
          eligibilitySnapshot: (r.eligibility_snapshot ?? {}) as Record<string, unknown>,
        }
      })
      return jsonResponse({ ok: true, claims, approvalMeaning: approvalDoesNotIssueVoucher() })
    }

    if (action === 'get') {
      if (typeof body.claimId !== 'string' || body.claimId.length < 8) {
        return publicError(400, 'invalid_request', 'claimId is required.')
      }
      const [{ data: detail, error: detailError }, { data: audits, error: auditError }] =
        await Promise.all([
          auth.userClient.rpc('operator_get_claim_detail', { p_claim_id: body.claimId }),
          auth.userClient.rpc('operator_list_claim_audits', { p_claim_id: body.claimId }),
        ])
      if (detailError || auditError) {
        console.error('operator get failed', detailError ?? auditError)
        return publicError(500, 'get_failed', 'Could not load claim detail.')
      }
      const row = Array.isArray(detail) ? detail[0] : detail
      if (!row) return publicError(404, 'not_found', 'Claim not found.')
      const r = row as Record<string, unknown>
      return jsonResponse({
        ok: true,
        claim: {
          claimId: String(r.claim_id),
          playerId: String(r.player_id),
          publicNickname: String(r.public_nickname ?? ''),
          rewardId: String(r.reward_id),
          rewardSlug: String(r.reward_slug ?? ''),
          rewardTitle: String(r.reward_title ?? ''),
          campaignId: String(r.campaign_id),
          status: String(r.status),
          claimPolicy: String(r.claim_policy ?? ''),
          eligibilitySnapshot: (r.eligibility_snapshot ?? {}) as Record<string, unknown>,
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
          decidedAt: r.decided_at == null ? null : String(r.decided_at),
        },
        audits: (Array.isArray(audits) ? audits : []).map((a) => {
          const x = a as Record<string, unknown>
          return {
            auditId: String(x.audit_id),
            eventType: String(x.event_type),
            actorRole: String(x.actor_role),
            payload: (x.payload ?? {}) as Record<string, unknown>,
            createdAt: String(x.created_at),
          }
        }),
        approvalMeaning: approvalDoesNotIssueVoucher(),
        canIssueVouchers: false,
      })
    }

    // review
    if (typeof body.claimId !== 'string' || body.claimId.length < 8) {
      return publicError(400, 'invalid_request', 'claimId is required.')
    }
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      return publicError(400, 'invalid_request', 'decision must be approve or reject.')
    }
    const reason =
      typeof body.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
        : null

    const { data, error } = await auth.userClient.rpc('operator_review_claim', {
      p_claim_id: body.claimId,
      p_decision: body.decision,
      p_reason: reason,
    })
    if (error) {
      console.error('operator_review_claim failed', error)
      return publicError(500, 'review_failed', 'Could not review claim.')
    }
    const row = Array.isArray(data) ? data[0] : data
    const result = row as Record<string, unknown> | null
    if (!result) return publicError(500, 'review_failed', 'Empty review result.')

    if (result.ok !== true) {
      return jsonResponse(
        {
          ok: false,
          code: String(result.rejection_code ?? 'review_rejected'),
          message: String(result.rejection_reason ?? 'Review rejected.'),
          fromStatus: result.from_status ?? null,
          toStatus: result.to_status ?? null,
        },
        result.rejection_code === 'invalid_transition' ? 409 : 400,
      )
    }

    return jsonResponse({
      ok: true,
      claimId: String(result.claim_id),
      fromStatus: String(result.from_status),
      toStatus: String(result.to_status),
      approvalMeaning: approvalDoesNotIssueVoucher(),
      voucherIssued: false,
      redeemed: false,
    })
  } catch (error) {
    console.error('operator-claims failed', error)
    return publicError(500, 'server_error', 'Operator claim request failed.')
  }
})
