import { useEffect, useState } from 'react'
import { ArrowLeft, CloudOff, UserRound } from 'lucide-react'
import {
  connectivityService,
  identityService,
  isBackendError,
  isBackendConfigured,
  profileService,
  validateNickname,
  type AuthState,
  type ConnectivitySnapshot,
  type PlayerProfile,
} from '../backend'
import { SoundToggle } from './SoundToggle'

type OnlineProfileScreenProps = {
  soundEnabled: boolean
  onToggleSound: () => void
  onBack: () => void
}

export function OnlineProfileScreen({
  soundEnabled,
  onToggleSound,
  onBack,
}: OnlineProfileScreenProps) {
  const [connectivity, setConnectivity] = useState<ConnectivitySnapshot>(() =>
    connectivityService.getStatus(),
  )
  const [auth, setAuth] = useState<AuthState>({ kind: 'offline' })
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const status = await connectivityService.ping()
      if (cancelled) return
      setConnectivity(status)
      if (!status.configured) {
        setAuth({ kind: 'offline' })
        return
      }
      try {
        const state = await identityService.getAuthState()
        if (cancelled) return
        setAuth(state)
        if (state.kind === 'anonymous') {
          const mine = await profileService.getMyProfile()
          if (cancelled) return
          setProfile(mine)
          if (mine) setNickname(mine.publicNickname)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(isBackendError(error) ? error.message : 'Could not load online status.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enableOnline = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const state = await identityService.ensureAnonymousSession()
      setAuth(state)
      if (state.kind === 'anonymous') {
        const mine = await profileService.getMyProfile()
        setProfile(mine)
        if (mine) setNickname(mine.publicNickname)
        setMessage(
          'Anonymous online session ready. Clearing this browser’s site data can make this session unrecoverable until account linking is added later.',
        )
      }
    } catch (error) {
      setMessage(isBackendError(error) ? error.message : 'Could not start an online session.')
    } finally {
      setBusy(false)
    }
  }

  const saveNickname = async (): Promise<void> => {
    const validated = validateNickname(nickname)
    if (!validated.ok) {
      setMessage(validated.reason)
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const saved = await profileService.upsertMyNickname(validated.nickname)
      setProfile(saved)
      setNickname(saved.publicNickname)
      setMessage('Nickname saved. Only this public name is shown online — never your auth ID.')
    } catch (error) {
      setMessage(isBackendError(error) ? error.message : 'Could not save nickname.')
    } finally {
      setBusy(false)
    }
  }

  const configured = isBackendConfigured()

  return (
    <section className="screen online-profile">
      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} className="sound-toggle" />
      <header className="online-profile-header">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>Online Profile</h1>
        <p className="tagline">
          Optional. Local rooftop challenges always work, even when online features are off.
        </p>
      </header>

      <div className="online-card">
        <div className="online-status">
          {configured ? <UserRound size={20} aria-hidden /> : <CloudOff size={20} aria-hidden />}
          <div>
            <strong>{connectivity.status.replace('_', ' ')}</strong>
            <p>{connectivity.message}</p>
          </div>
        </div>

        {!configured && (
          <p className="online-note">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
            <code>.env.local</code> to enable anonymous online identity. Never put a service-role key
            in the frontend.
          </p>
        )}

        {configured && auth.kind !== 'anonymous' && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void enableOnline()}
          >
            Continue anonymously
          </button>
        )}

        {auth.kind === 'anonymous' && (
          <div className="nickname-form">
            <label htmlFor="nickname">Public nickname</label>
            <input
              id="nickname"
              type="text"
              maxLength={20}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="SolarScout"
              autoComplete="nickname"
            />
            <p className="field-hint">3–20 characters. Letters, numbers, spaces, - _ .</p>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void saveNickname()}
            >
              Save nickname
            </button>
            {profile && (
              <p className="online-note">
                Current public name: <strong>{profile.publicNickname}</strong>
              </p>
            )}
          </div>
        )}

        {message && (
          <p className="online-message" role="status">
            {message}
          </p>
        )}
      </div>

      <div className="level-select-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>
      </div>
    </section>
  )
}
