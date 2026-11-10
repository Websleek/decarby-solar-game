import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Home, Mail, ShieldCheck, UserPlus, Trophy } from 'lucide-react'
import type { CampaignCompleteView } from '../../shared/campaign/types'
import {
  classifyEmailDelivery,
  emailDeliveryUserMessage,
} from '../../shared/rewards/emailDeliveryStatus'
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
}: VoucherDetailsScreenProps) {
  const formId = useId()
  const submittingRef = useRef(false)
  const [form, setForm] = useState<VoucherClaimFormState>(emptyVoucherClaimForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ClaimCampaignVoucherResult | null>(null)

  const rewardLabel = view.rewardLabel ?? formatAud(view.rewardAmountCents)
  const canSubmit =
    view.serverVerified &&
    view.rewardAmountCents > 0 &&
    view.run.serverBacked &&
    !view.run.provisional

  useEffect(() => {
    const cached = readCachedClaimResult(view.run.id)
    if (cached) setResult(cached)
  }, [view.run.id])

  const update = <K extends keyof VoucherClaimFormState>(key: K, value: VoucherClaimFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || submittingRef.current || result?.ok) return
    setError(null)

    if (!canSubmit) {
      setError(
        'This campaign result is not fully server-verified yet. Complete an online verified run before claiming.',
      )
      return
    }

    submittingRef.current = true
    setBusy(true)
    try {
      const response = await voucherClaimService.claim({
        runId: view.run.id,
        form,
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
          <p>
            <ShieldCheck size={18} aria-hidden /> Your voucher request has been processed.
          </p>
          <p>
            Player: <strong>{view.nickname}</strong>
          </p>
          <p>
            Stars: <strong>{view.totalStars}</strong> / 15
          </p>
          <p>
            Amount: <strong>{formatAud(result.amountCents)}</strong>
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
          <button type="button" className="btn btn-ghost" onClick={onHome}>
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
      <h1>Voucher details</h1>
      <p className="tagline">
        Confirm your contact details to receive your campaign voucher. Children can keep playing
        without submitting commercial contact information.
      </p>

      <div className="result-card voucher-summary-card">
        <p>
          Player: <strong>{view.nickname}</strong>
        </p>
        <p>
          Stars earned: <strong>{view.totalStars}</strong> / 15
        </p>
        <p>
          Awarded discount:{' '}
          <strong>{view.rewardAmountCents > 0 ? rewardLabel : 'Not eligible'}</strong>
        </p>
        <p className="muted">
          Discount amount is taken from your server-verified campaign result — not from this form.
        </p>
      </div>

      <form className="voucher-claim-form" id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <label className="field" htmlFor={`${formId}-name`}>
          Full name
          <input
            id={`${formId}-name`}
            name="fullName"
            autoComplete="name"
            required
            maxLength={120}
            value={form.fullName}
            disabled={busy}
            onChange={(event) => update('fullName', event.target.value)}
          />
        </label>

        <label className="field" htmlFor={`${formId}-phone`}>
          Mobile / phone number
          <input
            id={`${formId}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={32}
            placeholder="04xx xxx xxx"
            value={form.phone}
            disabled={busy}
            onChange={(event) => update('phone', event.target.value)}
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
            value={form.email}
            disabled={busy}
            onChange={(event) => update('email', event.target.value)}
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
            I agree to the Decarby promotional terms ({voucherClaimService.termsVersion}).
          </span>
        </label>

        <label className="voucher-check" htmlFor={`${formId}-adult`}>
          <input
            id={`${formId}-adult`}
            type="checkbox"
            checked={form.adultSelfAttested}
            disabled={busy}
            onChange={(event) => update('adultSelfAttested', event.target.checked)}
          />
          <span>
            I confirm I am an adult eligible for this promotional offer (self-attestation only).
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

        <div className="complete-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !canSubmit}>
            Send My Voucher
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
            <ArrowLeft size={16} aria-hidden />
            Back to results
          </button>
          <button type="button" className="btn btn-ghost" onClick={onHome} disabled={busy}>
            <Home size={16} aria-hidden />
            Home
          </button>
        </div>
      </form>
    </section>
  )
}
