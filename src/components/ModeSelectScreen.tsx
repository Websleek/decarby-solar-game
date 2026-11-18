import { Award, Clock3, Landmark, ArrowLeft, Trophy, UserRound } from 'lucide-react'
import type { GameMode } from '../types/game'
import { SoundToggle } from './SoundToggle'

type ModeSelectScreenProps = {
  soundEnabled: boolean
  onToggleSound: () => void
  onSelectMode: (mode: GameMode) => void
  onBack: () => void
  onOnlineProfile: () => void
  onSolarChampions: () => void
  onRewardCentre: () => void
  /** Only rendered when the signed-in account is an active staff operator. */
  onOperatorClaims?: () => void
  showOperatorClaims?: boolean
  timeAttackAvailable: boolean
}

export function ModeSelectScreen({
  soundEnabled,
  onToggleSound,
  onSelectMode,
  onBack,
  onOnlineProfile,
  onSolarChampions,
  onRewardCentre,
  onOperatorClaims,
  showOperatorClaims = false,
  timeAttackAvailable,
}: ModeSelectScreenProps) {
  return (
    <section className="screen mode-select">
      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} className="sound-toggle" />
      <header className="mode-select-header">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>More ways to play</h1>
        <p className="tagline">
          Extra practice modes. The main event challenge is the 3-rooftop Play Now flow.
        </p>
      </header>

      <div className="mode-cards">
        <button type="button" className="mode-card" onClick={() => onSelectMode('classic')}>
          <div className="mode-icon">
            <Landmark size={28} aria-hidden />
          </div>
          <h2>Classic practice</h2>
          <p>Replay rooftops, including optional harder roofs outside the main event path.</p>
        </button>

        <button
          type="button"
          className={`mode-card ${timeAttackAvailable ? '' : 'is-locked'}`}
          onClick={() => timeAttackAvailable && onSelectMode('timeAttack')}
          disabled={!timeAttackAvailable}
        >
          <div className="mode-icon">
            <Clock3 size={28} aria-hidden />
          </div>
          <h2>Time Attack</h2>
          <p>
            {timeAttackAvailable
              ? 'Race for 100% coverage on completed rooftops. Beat your best time!'
              : 'Complete a Classic level first to unlock Time Attack.'}
          </p>
        </button>
      </div>

      <div className="level-select-actions mode-select-actions">
        <button type="button" className="btn btn-ghost" onClick={onRewardCentre}>
          <Award size={16} aria-hidden />
          Reward Centre
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSolarChampions}>
          <Trophy size={16} aria-hidden />
          Solar Champions
        </button>
        <button type="button" className="btn btn-ghost" onClick={onOnlineProfile}>
          <UserRound size={16} aria-hidden />
          Online profile (optional)
        </button>
        {showOperatorClaims && onOperatorClaims && (
          <button type="button" className="btn btn-ghost" onClick={onOperatorClaims}>
            Staff claim review
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>
      </div>
    </section>
  )
}
