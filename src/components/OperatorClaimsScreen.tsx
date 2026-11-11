import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, RefreshCw, Shield, X } from 'lucide-react'
import {
  isBackendError,
  operatorClaimsService,
  type OperatorClaimDetail,
  type OperatorPendingClaim,
} from '../backend'
import { SoundToggle } from './SoundToggle'

type OperatorClaimsScreenProps = {
  soundEnabled: boolean
  onToggleSound: () => void
  onBack: () => void
}

export function OperatorClaimsScreen({
  soundEnabled,
  onToggleSound,
  onBack,
}: OperatorClaimsScreenProps) {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [pending, setPending] = useState<readonly OperatorPendingClaim[]>([])
  const [selected, setSelected] = useState<OperatorClaimDetail | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const ok = await operatorClaimsService.checkAccess()
      setAuthorized(ok)
      if (!ok) {
        setPending([])
        setSelected(null)
        setMessage('Authorised staff operator role required.')
        return
      }
      const rows = await operatorClaimsService.listPending()
      setPending(rows)
    } catch (error) {
      setAuthorized(false)
      setMessage(isBackendError(error) ? error.message : 'Could not load operator queue.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openClaim = async (claimId: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const detail = await operatorClaimsService.getClaim(claimId)
      setSelected(detail)
      setReason('')
    } catch (error) {
      setMessage(isBackendError(error) ? error.message : 'Could not load claim detail.')
    } finally {
      setBusy(false)
    }
  }

  const review = async (decision: 'approve' | 'reject') => {
    if (!selected) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await operatorClaimsService.review(
        selected.claim.claimId,
        decision,
        reason.trim() || undefined,
      )
      setMessage(
        `Claim ${result.toStatus}. Approval means reviewed only — no voucher issued.`,
      )
      setSelected(null)
      const rows = await operatorClaimsService.listPending()
      setPending(rows)
    } catch (error) {
      setMessage(isBackendError(error) ? error.message : 'Review failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="screen operator-claims-screen">
      <header className="screen-header">
        <button type="button" className="btn btn-ghost" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="eyebrow">Internal</p>
          <h1>Claim review</h1>
        </div>
        <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
      </header>

      <div className="operator-claims-body">
        <p className="muted">
          Staff-only queue. Approve means reviewed/approved — not issued, paid, or redeemed.
        </p>

        <div className="operator-claims-toolbar">
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={16} /> Refresh
          </button>
          <span className="muted">
            <Shield size={14} /> {authorized ? 'Operator access granted' : 'Access check…'}
          </span>
        </div>

        {message && <p className="status-banner">{message}</p>}

        {authorized === false && (
          <p className="muted">This workspace is hidden unless your account is an active staff operator.</p>
        )}

        {authorized && (
          <div className="operator-claims-layout">
            <ul className="operator-claim-list">
              {pending.length === 0 && <li className="muted">No pending claims.</li>}
              {pending.map((claim) => (
                <li key={claim.claimId}>
                  <button
                    type="button"
                    className="operator-claim-row"
                    onClick={() => void openClaim(claim.claimId)}
                  >
                    <strong>{claim.rewardTitle}</strong>
                    <span>
                      {claim.publicNickname} · {new Date(claim.createdAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selected && (
              <article className="operator-claim-detail">
                <h2>{selected.claim.rewardTitle}</h2>
                <p>
                  Player: {selected.claim.publicNickname} · Status: {selected.claim.status}
                </p>
                <h3>Eligibility snapshot</h3>
                <pre className="operator-json">
                  {JSON.stringify(selected.claim.eligibilitySnapshot, null, 2)}
                </pre>
                <h3>Audit history</h3>
                <ul>
                  {selected.audits.map((audit) => (
                    <li key={audit.auditId}>
                      {audit.eventType} · {audit.actorRole} ·{' '}
                      {new Date(audit.createdAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
                <label className="field">
                  Review reason (optional)
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                </label>
                <div className="operator-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || selected.claim.status !== 'pending'}
                    onClick={() => void review('approve')}
                  >
                    <Check size={16} /> Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || selected.claim.status !== 'pending'}
                    onClick={() => void review('reject')}
                  >
                    <X size={16} /> Reject
                  </button>
                </div>
                <p className="muted">
                  Voucher issuance and redemption are disabled in this phase.
                </p>
              </article>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
