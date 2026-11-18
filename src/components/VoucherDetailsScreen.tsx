import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Home, Mail, ShieldCheck, UserPlus, Trophy } from 'lucide-react'
import type { CampaignCompleteView } from '../../shared/campaign/types'
import { MAX_CAMPAIGN_STARS } from '../../shared/campaign/rewardTiers'
import {
  classifyEmailDelivery,
  emailDeliveryUserMessage,
} from '../../shared/rewards/emailDeliveryStatus'
import { evaluateVoucherSubmitReadiness } from '../../shared/rewards/voucherSubmitReadiness'
import type { ClaimCampaignVoucherResult } from '../../shared/rewards/voucherClaim'
import {
  emptyVoucherClaimForm,
  voucherClaimService,
  type VoucherClaimFormState,
} from '../backend/services/voucherClaim'
import {
  readCachedClaimResult,
  writeCachedClaimResult,
} from '../services/claimResultCache'

type VoucherDetailsScreenProps = {
  view: CampaignCompleteView
  onBack: () => void
  onHome: () => void
  onNewPlayer: () => void
  onViewLeaderboard: () => void
  onRetryVerification?: () => void
}

function formatAud(cents: number): string {
  return `A$${(cents / 100).toFixed(0)}`
}

export function VoucherDetailsScreen({
  view,
  onBack,
  onHome,
  onNewPlayer,
  onViewLeaderboard,
  onRetryVerification,
}: VoucherDetailsScreenProps) {
  const formId = useId()
  const submittingRef = useRef(false)
  const [form, setForm] = useState<VoucherClaimFormState>(emptyVoucherClaimForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ClaimCampaignVoucherResult | null>(null)

  const rewardLabel = view.rewardLabel ?? formatAud(view.rewardAmountCents)

  useEffect(() => {
    const cached = readCachedClaimResult(view.run.id)
    if (cached) setResult(cached)
  }, [view.run.id])

  const readiness = useMemo(
    () =>
      evaluateVoucherSubmitReadiness(
        {
          serverVerified: view.serverVerified,
          rewardAmountCents: view.rewardAmountCents,
          serverBacked: view.run.serverBacked,
          provisional: view.run.provisional,
          alreadyClaimed: result?.ok === true,
          busy,
        },
        {
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          termsAccepted: form.termsAccepted,
          marketingOptIn: form.marketingOptIn,
        },
      ),
    [view, form, busy, result],
  )

  const update = <K extends keyof VoucherClaimFormState>(key: K, value: VoucherClaimFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || submittingRef.current || result?.ok) return
    setError(null)

    const latest = evaluateVoucherSubmitReadiness(
      {
        serverVerified: view.serverVerified,
        rewardAmountCents: view.rewardAmountCents,
        serverBacked: view.run.serverBacked,
        provisional: view.run.provisional,
        alreadyClaimed: false,
        busy: false,
      },
      {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        termsAccepted: form.termsAccepted,
        marketingOptIn: form.marketingOptIn,
      },
    )

    if (!latest.canSubmit) {
      setError(latest.blockers[0] ?? 'Complete the required fields to send your voucher.')
      return
    }

    submittingRef.current = true
    setBusy(true)
    try {
      const response = await voucherClaimService.claim({
        runId: view.run.id,
        form: {
          ...form,
          // Adult checkbox removed — never fabricate attestation.
          adultSelfAttested: false,
        },
      })
      setResult(response)
      if (response.ok) {
        writeCachedClaimResult(view.run.id, response)
      } else {
        setError(response.message)
      }
    } catch {
      setError('Something went wrong while preparing your voucher. Please try again.')
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  if (result?.ok) {
    const deliveryKind = classifyEmailDelivery({
      emailStatus: result.emailStatus,
      emailProvider: result.emailProvider,
      demo: result.demo,
      redeemable: result.redeemable,
    })
    const deliveryMessage = emailDeliveryUserMessage(deliveryKind)

    return (
      <section className="screen complete voucher-details" aria-live="polite">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>Voucher request received</h1>
        <p className="tagline">{result.message}</p>

        <div className="result-card voucher-success-card">
          <p className="voucher-amount-hero">{formatAud(result.amountCents)}</p>
          <div className="voucher-summary-grid" aria-label="Claim summary">
            <div>
              <span>Player</span>
              <strong>{view.nickname}</strong>
            </div>
            <div>
              <span>Stars</span>
              <strong>
                {view.totalStars} / {MAX_CAMPAIGN_STARS}
              </strong>
            </div>
            <div>
              <span>Status</span>
              <strong>Processed</strong>
            </div>
          </div>
          <p>
            <ShieldCheck size={18} aria-hidden /> Your voucher request has been processed.
          </p>
          {(result.demo || !result.redeemable) && (
            <p className="voucher-demo-banner" role="status">
              Demo mode: no redeemable discount has been issued.
            </p>
          )}
          <p className="voucher-delivery-status" role="status">
            {deliveryMessage}
          </p>
          {result.idempotent && (
            <p className="muted">Existing claim reused — no additional voucher was created.</p>
          )}
        </div>

        <div className="complete-actions voucher-terminal-actions">
          <button type="button" className="btn btn-primary" onClick={onNewPlayer}>
            <UserPlus size={16} aria-hidden />
            New Player
          </button>
          <button type="button" className="btn btn-secondary" onClick={onViewLeaderboard}>
            <Trophy size={16} aria-hidden />
            View Leaderboard
          </button>
          <button type="button" className="btn btn-tertiary" onClick={onHome}>
            <Home size={16} aria-hidden />
            Home
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="screen complete voucher-details">
      <p className="brand-mark">
        <span>Decarby</span> Solar
      </p>
      <h1>Claim your voucher</h1>
      <p className="tagline">Enter your name and email. Phone is optional.</p>

      <div className="result-card voucher-summary-card">
        <div className="voucher-summary-grid" aria-label="Campaign reward summary">
          <div>
            <span>Player</span>
            <strong>{view.nickname}</strong>
          </div>
          <div>
            <span>Stars</span>
            <strong>
              {view.totalStars} / {MAX_CAMPAIGN_STARS}
            </strong>
          </div>
          <div>
            <span>Discount</span>
            <strong>{view.rewardAmountCents > 0 ? rewardLabel : 'Not eligible'}</strong>
          </div>
        </div>
        <p className="muted">
          Discount amount comes from your server-verified campaign result — not this form.
        </p>
      </div>

      {!readiness.campaignReady && (
        <div className="status-banner" role="status">
          <p>{readiness.blockers[0]}</p>
          {onRetryVerification && (view.run.provisional || !view.serverVerified) && (
            <button type="button" className="btn btn-secondary" onClick={onRetryVerification}>
              Retry verification
            </button>
          )}
        </div>
      )}

      <form className="voucher-claim-form" id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <label className="field" htmlFor={`${formId}-name`}>
          Full name
          <input
            id={`${formId}-name`}
            name="fullName"
            autoComplete="name"
            required
            maxLength={120}
            placeholder="Jane Citizen"
            value={form.fullName}
            disabled={busy}
            onChange={(event) => update('fullName', event.target.value)}
          />
        </label>

        <label className="field" htmlFor={`${formId}-email`}>
          Email address
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            placeholder="you@example.com"
            value={form.email}
            disabled={busy}
            onChange={(event) => update('email', event.target.value)}
          />
        </label>

        <label className="field" htmlFor={`${formId}-phone`}>
          Mobile / phone number <span className="field-optional">(optional)</span>
          <input
            id={`${formId}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={32}
            placeholder="04xx xxx xxx"
            value={form.phone}
            disabled={busy}
            onChange={(event) => update('phone', event.target.value)}
          />
        </label>

        <label className="voucher-check" htmlFor={`${formId}-terms`}>
          <input
            id={`${formId}-terms`}
            type="checkbox"
            checked={form.termsAccepted}
            disabled={busy}
            onChange={(event) => update('termsAccepted', event.target.checked)}
          />
          <span>
            I agree to the Decarby promotional terms ({voucherClaimService.termsVersion}).{' '}
            <a
              className="terms-link"
              href="https://decarbysolar.com.au/"
              target="_blank"
              rel="noreferrer"
            >
              Read Decarby Solar information
            </a>
            . An approved public terms page is not linked yet.
          </span>
        </label>

        <label className="voucher-check" htmlFor={`${formId}-marketing`}>
          <input
            id={`${formId}-marketing`}
            type="checkbox"
            checked={form.marketingOptIn}
            disabled={busy}
            onChange={(event) => update('marketingOptIn', event.target.checked)}
          />
          <span>Optional: send me Decarby Solar marketing updates.</span>
        </label>

        {busy && (
          <p className="voucher-processing" role="status">
            <Mail size={16} aria-hidden /> Preparing your voucher...
          </p>
        )}

        {error && (
          <p className="status-banner" role="alert">
            {error}
          </p>
        )}

        {!error && !readiness.canSubmit && readiness.blockers.length > 0 && (
          <ul className="voucher-blockers" aria-live="polite">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}

        <div className="voucher-submit-stack">
          <button type="submit" className="btn btn-primary" disabled={busy || !readiness.canSubmit}>
            Send My Voucher
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
            <ArrowLeft size={16} aria-hidden />
            Back to results
          </button>
        </div>
      </form>
    </section>
  )
}
