import { useState } from 'react'
import { ArrowLeft, Play, CloudOff, RefreshCw } from 'lucide-react'
import { isBackendConfigured, validateNickname } from '../backend'
import { SoundToggle } from './SoundToggle'

export type PromoStartOutcome =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>

type PromotionalNicknameScreenProps = {
  soundEnabled: boolean
  onToggleSound: () => void
  initialNickname?: string
  onContinue: (nickname: string, mode: 'online' | 'offline') => Promise<PromoStartOutcome>
  onBack: () => void
}

export function PromotionalNicknameScreen({
  soundEnabled,
  onToggleSound,
  initialNickname = '',
  onContinue,
  onBack,
}: PromotionalNicknameScreenProps) {
  const [nickname, setNickname] = useState(initialNickname)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const onlineReady = isBackendConfigured()

  const submit = async (mode: 'online' | 'offline') => {
    const validated = validateNickname(nickname)
    if (!validated.ok) {
      setMessage(validated.reason)
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const outcome = await onContinue(validated.nickname, mode)
      if (!outcome.ok) {
        setMessage(outcome.message)
      }
    } catch {
      setMessage('Could not start the challenge. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="screen promo-nickname">
      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} className="sound-toggle" />
      <header className="promo-nickname-header">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>Choose your player name</h1>
        <p className="tagline">
          Pick a public nickname, then power three rooftops. No email or phone needed to play.
        </p>
      </header>

      <label className="field">
        Nickname
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={20}
          autoComplete="nickname"
          placeholder="e.g. SolarFox"
          disabled={busy}
        />
      </label>

      {message && (
        <div className="status-banner" role="alert">
          <p>{message}</p>
          {onlineReady && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void submit('online')}
            >
              <RefreshCw size={16} aria-hidden />
              Retry connection
            </button>
          )}
        </div>
      )}

      {!onlineReady && (
        <p className="reward-status">
          <CloudOff size={16} aria-hidden /> Online verification is unavailable. You can still play a
          local demo, but it will not qualify for a promotional voucher.
        </p>
      )}

      <div className="welcome-actions">
        {onlineReady ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void submit('online')}
          >
            <Play size={18} aria-hidden />
            {busy ? 'Connecting…' : 'Start 3-rooftop challenge'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void submit('offline')}
          >
            <Play size={18} aria-hidden />
            Play local demo
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>
      </div>
    </section>
  )
}
