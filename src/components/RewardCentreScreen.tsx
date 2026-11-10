import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Award,
  CloudOff,
  Lock,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import {
  achievementService,
  isBackendConfigured,
  isBackendError,
  playerClaimsService,
  type AchievementCatalogEntry,
  type PlayerClaimSummary,
} from '../backend'
import { CAMPAIGN_LEVEL_IDS } from '../../shared/achievements/registry'
import { listLocalLevels } from '../levels'
import type { PlayerProgress } from '../types/services'
import { SoundToggle } from './SoundToggle'

type RewardCentreScreenProps = {
  progress: PlayerProgress
  soundEnabled: boolean
  onToggleSound: () => void
  onBack: () => void
  onOnlineProfile: () => void
}

type FilterId = 'all' | 'unlocked' | 'locked'
type LoadState = 'loading' | 'ready' | 'offline' | 'error'

function formatEarnedAt(value: string | null): string | null {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function nextReachable(catalog: readonly AchievementCatalogEntry[]): AchievementCatalogEntry | null {
  return (
    catalog.find((entry) => !entry.unlocked && entry.id !== 'solar_legend') ??
    catalog.find((entry) => !entry.unlocked) ??
    null
  )
}

export function RewardCentreScreen({
  progress,
  soundEnabled,
  onToggleSound,
  onBack,
  onOnlineProfile,
}: RewardCentreScreenProps) {
  const [filter, setFilter] = useState<FilterId>('all')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<readonly AchievementCatalogEntry[]>(() =>
    achievementService.previewFromLocalProgress(progress),
  )
  const [claims, setClaims] = useState<readonly PlayerClaimSummary[]>([])
  const [claimsMessage, setClaimsMessage] = useState<string | null>(null)

  const levels = listLocalLevels()
  const totalStars = CAMPAIGN_LEVEL_IDS.reduce(
    (sum, id) => sum + (progress.bestStars[id] ?? 0),
    0,
  )
  const completedCount = CAMPAIGN_LEVEL_IDS.filter((id) =>
    progress.completedLevels.includes(id),
  ).length

  const load = async (): Promise<void> => {
    setLoadState('loading')
    setMessage(null)
    const localCatalog = achievementService.previewFromLocalProgress(progress)

    if (!isBackendConfigured()) {
      setCatalog(localCatalog)
      setLoadState('offline')
      setMessage(
        'Showing device progress only. Connect online with a public nickname to earn verified badges.',
      )
      return
    }

    try {
      const synced = await achievementService.sync(progress)
      setCatalog(synced.catalog)
      setLoadState('ready')
      try {
        const mine = await playerClaimsService.listMine()
        setClaims(mine)
        setClaimsMessage(
          mine.length === 0
            ? 'No promotional claim history yet. Public claiming stays disabled.'
            : null,
        )
      } catch {
        setClaims([])
        setClaimsMessage('Claim history unavailable until your online profile is ready.')
      }
    } catch (error) {
      setCatalog(localCatalog)
      setClaims([])
      if (isBackendError(error) && (error.code === 'unauthenticated' || error.code === 'not_configured')) {
        setLoadState('offline')
        setMessage(
          'Verified badges need an optional online profile. Local rooftop progress still appears below.',
        )
        return
      }
      setLoadState('error')
      setMessage(isBackendError(error) ? error.message : 'Could not load verified achievements.')
    }
  }

  useEffect(() => {
    void load()
    // Refresh when progress identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.completedLevels.length, progress.achievements.length])

  const unlockedCount = catalog.filter((entry) => entry.unlocked).length
  const filtered = useMemo(() => {
    if (filter === 'unlocked') return catalog.filter((entry) => entry.unlocked)
    if (filter === 'locked') return catalog.filter((entry) => !entry.unlocked)
    return catalog
  }, [catalog, filter])

  const next = nextReachable(catalog)

  return (
    <section className="screen reward-centre">
      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} className="sound-toggle" />

      <header className="reward-centre-header">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>
          <Award size={26} aria-hidden />
          Reward Centre
        </h1>
        <p className="tagline">
          Track rooftop stars and verified badges. Local play always works — online badges need a
          verified run.
        </p>
      </header>

      <div className="reward-progress-card">
        <div>
          <p className="reward-stat-label">Campaign rooftops</p>
          <p className="reward-stat-value">
            {completedCount} / {CAMPAIGN_LEVEL_IDS.length}
          </p>
        </div>
        <div>
          <p className="reward-stat-label">Best stars</p>
          <p className="reward-stat-value">{totalStars}</p>
        </div>
        <div>
          <p className="reward-stat-label">Verified badges</p>
          <p className="reward-stat-value">
            {unlockedCount} / {catalog.length}
          </p>
        </div>
      </div>

      <div className="reward-star-grid" aria-label="Best stars by rooftop">
        {levels.map((level) => (
          <div key={level.id} className="reward-star-chip">
            <span>L{level.number}</span>
            <strong>{'★'.repeat(progress.bestStars[level.id] ?? 0) || '–'}</strong>
          </div>
        ))}
      </div>

      {next && (
        <p className="reward-next">
          <Sparkles size={16} aria-hidden />
          Next up: <strong>{next.title}</strong> — {next.description}
        </p>
      )}

      <div className="reward-filters" role="tablist" aria-label="Badge filter">
        {(
          [
            ['all', 'All'],
            ['unlocked', 'Unlocked'],
            ['locked', 'Locked'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`reward-filter ${filter === id ? 'is-active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loadState === 'loading' && (
        <p className="reward-status">Loading badge collection…</p>
      )}
      {loadState === 'offline' && (
        <p className="reward-status">
          <CloudOff size={16} aria-hidden /> {message}
        </p>
      )}
      {loadState === 'error' && (
        <div className="reward-status is-error">
          <p>{message}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw size={16} aria-hidden />
            Try again
          </button>
        </div>
      )}

      <ul className="reward-badge-list">
        {filtered.map((entry) => {
          const earnedLabel = formatEarnedAt(entry.earnedAt)
          return (
            <li
              key={entry.id}
              className={`reward-badge-card ${entry.unlocked ? 'is-unlocked' : 'is-locked'}`}
            >
              <span className="reward-badge-icon" aria-hidden>
                {entry.unlocked ? <Trophy size={22} /> : <Lock size={20} />}
              </span>
              <div className="reward-badge-copy">
                <h2>{entry.title}</h2>
                <p>{entry.description}</p>
                {entry.unlocked && earnedLabel && (
                  <p className="reward-badge-meta">Unlocked {earnedLabel}</p>
                )}
                {!entry.unlocked && entry.localPreviewOnly && (
                  <p className="reward-badge-meta is-preview">
                    Local progress spotted — verify online to earn the official badge.
                  </p>
                )}
                {!entry.unlocked && !entry.localPreviewOnly && entry.telemetryNote && (
                  <p className="reward-badge-meta">{entry.telemetryNote}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {filtered.length === 0 && loadState !== 'loading' && (
        <p className="reward-status">No badges in this filter yet.</p>
      )}

      <aside className="reward-promo" aria-label="Promotional rewards">
        <p className="reward-promo-kicker">Coming later</p>
        <p>
          <strong>Promotional rewards coming soon.</strong> No discount codes, claim buttons or
          payments are available in this version.
        </p>
      </aside>

      <section className="reward-claim-history" aria-label="Your promotional claim history">
        <h2>Your claim history</h2>
        <p className="muted">
          Read-only status for your own promotional claims. Claiming remains disabled — there is no
          Claim Reward action here.
        </p>
        {claimsMessage && <p className="reward-status">{claimsMessage}</p>}
        {claims.length > 0 && (
          <ul className="reward-claim-list">
            {claims.map((claim) => (
              <li key={claim.claimId}>
                <strong>{claim.rewardTitle}</strong>
                <span>
                  {claim.status}
                  {claim.decidedAt
                    ? ` · decided ${formatEarnedAt(claim.decidedAt) ?? claim.decidedAt}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="level-select-actions mode-select-actions">
        <button type="button" className="btn btn-ghost" onClick={onOnlineProfile}>
          Online profile
        </button>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          Back to modes
        </button>
      </div>
    </section>
  )
}
