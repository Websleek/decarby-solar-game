import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatCanberraDateTime, redeemedMessageCanberra } from '../../shared/staff/canberraTime'
import {
  fetchStaffSession,
  staffLogin,
  staffLogout,
  staffLookup,
  staffRedeem,
  type StaffVoucherResult,
} from './staffApi'

type Phase = 'loading' | 'locked' | 'ready'

function amountLabel(cents: number, currency: string): string {
  const dollars = (cents / 100).toFixed(0)
  if (currency === 'AUD') return `A$${dollars}`
  return `${currency} ${dollars}`
}

function statusLabel(status: string): string {
  switch (status) {
    case 'valid':
      return 'Valid'
    case 'redeemed':
      return 'Redeemed'
    case 'expired':
      return 'Expired'
    case 'void':
      return 'Cancelled'
    case 'not_redeemable':
      return 'Not redeemable'
    default:
      return 'Invalid'
  }
}

export function StaffVerificationApp() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  const [codeInput, setCodeInput] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [voucher, setVoucher] = useState<StaffVoucherResult | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [redeemBusy, setRedeemBusy] = useState(false)
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchStaffSession().then((session) => {
      if (cancelled) return
      setPhase(session.authenticated ? 'ready' : 'locked')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onUnlock = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      setAuthBusy(true)
      setAuthError(null)
      try {
        const result = await staffLogin(password)
        if (!result.ok) {
          setAuthError(result.message ?? 'Incorrect password.')
          return
        }
        setPassword('')
        setPhase('ready')
      } finally {
        setAuthBusy(false)
      }
    },
    [password],
  )

  const onSignOut = useCallback(async () => {
    await staffLogout()
    setVoucher(null)
    setLookupError(null)
    setRedeemMessage(null)
    setConfirmOpen(false)
    setPhase('locked')
  }, [])

  const onVerify = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      setLookupBusy(true)
      setLookupError(null)
      setRedeemMessage(null)
      setConfirmOpen(false)
      try {
        const result = await staffLookup(codeInput)
        if (!result.ok || !result.voucher) {
          if (result.code === 'unauthorized') {
            setPhase('locked')
            setAuthError('Session expired. Enter the staff password again.')
          }
          setVoucher(null)
          setLookupError(result.message ?? 'No voucher matches that code.')
          return
        }
        setVoucher(result.voucher)
      } finally {
        setLookupBusy(false)
      }
    },
    [codeInput],
  )

  const onConfirmRedeem = useCallback(async () => {
    if (!voucher) return
    setRedeemBusy(true)
    setRedeemMessage(null)
    try {
      const result = await staffRedeem(voucher.code)
      if (result.voucher) setVoucher(result.voucher)
      if (!result.ok) {
        if (result.code === 'unauthorized') {
          setPhase('locked')
          setAuthError('Session expired. Enter the staff password again.')
          setConfirmOpen(false)
          return
        }
        setRedeemMessage(result.message ?? 'Redemption failed.')
        setConfirmOpen(false)
        return
      }
      setRedeemMessage('Voucher redeemed successfully.')
      setConfirmOpen(false)
    } finally {
      setRedeemBusy(false)
    }
  }, [voucher])

  if (phase === 'loading') {
    return (
      <main className="staff-page">
        <div className="staff-card staff-card--narrow">
          <p className="staff-muted">Checking session…</p>
        </div>
      </main>
    )
  }

  if (phase === 'locked') {
    return (
      <main className="staff-page">
        <div className="staff-card staff-card--narrow">
          <p className="staff-brand">
            <span>Decarby</span> Solar
          </p>
          <h1 className="staff-title">Voucher Verification</h1>
          <p className="staff-support">Authorised Decarby staff only.</p>
          <form className="staff-form" onSubmit={(e) => void onUnlock(e)}>
            <label className="staff-label" htmlFor="staff-password">
              Password
            </label>
            <input
              id="staff-password"
              className="staff-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {authError && (
              <p className="staff-error" role="alert">
                {authError}
              </p>
            )}
            <button type="submit" className="staff-btn staff-btn--primary" disabled={authBusy}>
              {authBusy ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  const canRedeem = !!voucher?.canRedeem && voucher.displayStatus === 'valid'

  return (
    <main className="staff-page">
      <div className="staff-card">
        <header className="staff-header">
          <div>
            <p className="staff-brand">
              <span>Decarby</span> Solar
            </p>
            <h1 className="staff-title">Voucher Verification</h1>
          </div>
          <button type="button" className="staff-btn staff-btn--ghost" onClick={() => void onSignOut()}>
            Sign Out
          </button>
        </header>

        <form className="staff-form" onSubmit={(e) => void onVerify(e)}>
          <label className="staff-label" htmlFor="voucher-code">
            Voucher code
          </label>
          <input
            id="voucher-code"
            className="staff-input staff-input--code"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="DSR-XXXX-XXXX-XXXX"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            required
          />
          <button type="submit" className="staff-btn staff-btn--primary" disabled={lookupBusy}>
            {lookupBusy ? 'Checking…' : 'Verify Code'}
          </button>
        </form>

        {lookupError && (
          <p className="staff-error" role="alert">
            {lookupError}
          </p>
        )}

        {voucher && (
          <section
            className={`staff-result staff-result--${voucher.displayStatus}`}
            aria-live="polite"
          >
            <div className="staff-result__badge">{statusLabel(voucher.displayStatus)}</div>
            <p className="staff-result__code">{voucher.code}</p>
            <dl className="staff-result__meta">
              <div>
                <dt>Discount</dt>
                <dd>{amountLabel(voucher.amountCents, voucher.currency)}</dd>
              </div>
              <div>
                <dt>Campaign</dt>
                <dd>{voucher.campaignId}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{formatCanberraDateTime(voucher.issuedAt)}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{formatCanberraDateTime(voucher.expiresAt)}</dd>
              </div>
            </dl>

            {voucher.displayStatus === 'redeemed' && (
              <p className="staff-result__note">{redeemedMessageCanberra(voucher.redeemedAt)}</p>
            )}
            {voucher.displayStatus === 'not_redeemable' && (
              <p className="staff-result__note">
                This code is demo or non-live and cannot be redeemed.
              </p>
            )}
            {voucher.displayStatus === 'expired' && (
              <p className="staff-result__note">This voucher has expired.</p>
            )}

            {redeemMessage && <p className="staff-result__note">{redeemMessage}</p>}

            <button
              type="button"
              className="staff-btn staff-btn--redeem"
              disabled={!canRedeem || redeemBusy}
              onClick={() => setConfirmOpen(true)}
            >
              Redeem Voucher
            </button>
          </section>
        )}
      </div>

      {confirmOpen && voucher && (
        <div className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="redeem-confirm-title">
          <div className="staff-modal__card">
            <h2 id="redeem-confirm-title">Confirm redemption</h2>
            <p>
              Redeem <strong>{voucher.code}</strong> for{' '}
              <strong>{amountLabel(voucher.amountCents, voucher.currency)}</strong>? This cannot be
              undone.
            </p>
            <div className="staff-modal__actions">
              <button
                type="button"
                className="staff-btn staff-btn--ghost"
                disabled={redeemBusy}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="staff-btn staff-btn--redeem"
                disabled={redeemBusy}
                onClick={() => void onConfirmRedeem()}
              >
                {redeemBusy ? 'Redeeming…' : 'Confirm Redeem'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
