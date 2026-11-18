import { useEffect, useState } from 'react'
import { Award, CheckCircle2, ArrowRight, LoaderCircle } from 'lucide-react'
import { getLevelById, getNextCampaignLevel, getNextLevel } from '../levels'
import { formatDuration } from '../engine/scoring'
import { ACHIEVEMENTS, type AchievementId } from '../services/localProgress'
import type { LevelResult, OnlineSubmissionState } from '../types/game'
import type { PlayerProgress } from '../types/services'
import { OnlineSubmissionBanner } from './OnlineSubmissionBanner'

type LevelCompleteScreenProps = {
  result: LevelResult
  progress: PlayerProgress
  onlineSubmission: OnlineSubmissionState
  nextUnlocked: boolean
  isFinalLevel: boolean
  /** Event campaign: no replay, sequential next only. */
  eventCampaignMode?: boolean
  onReplay?: () => void
  onNextLevel: () => void
  onLevelSelect?: () => void
  onCampaignComplete: () => void
  onRetryVerification?: () => void
}

export function LevelCompleteScreen({
  result,
  progress,
  onlineSubmission,
  nextUnlocked,
  isFinalLevel,
  eventCampaignMode = false,
  onNextLevel,
  onCampaignComplete,
  onRetryVerification,
}: LevelCompleteScreenProps) {
  const [shownStars, setShownStars] = useState(0)
  const level = getLevelById(result.levelId)
  const next = eventCampaignMode
    ? getNextCampaignLevel(result.levelId)
    : getNextLevel(result.levelId)
  const perfectSaved = progress.perfectRoofLevels.includes(result.levelId)
  const verifying = onlineSubmission.status === 'submitting'
  const needsRetry =
    eventCampaignMode &&
    (onlineSubmission.status === 'unable_to_connect' || onlineSubmission.status === 'rejected')

  useEffect(() => {
    setShownStars(0)
    if (result.stars === 0) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setShownStars(result.stars)
      return
    }
    const timers: number[] = []
    for (let i = 1; i <= result.stars; i += 1) {
      timers.push(window.setTimeout(() => setShownStars(i), i * 350))
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [result])

  const achievementIds = result.achievements.filter(
    (id): id is AchievementId => id in ACHIEVEMENTS,
  )

  const canAdvance =
    result.stars >= 1 &&
    (eventCampaignMode ? true : nextUnlocked) &&
    !verifying

  return (
    <section className="screen complete">
      <p className="brand-mark">Rooftop {level?.number ?? ''}</p>
      <h1>
        {result.isPerfect
          ? `${level?.title ?? 'Roof'} Perfect!`
          : `${level?.title ?? 'Design'} Complete!`}
      </h1>

      <OnlineSubmissionBanner state={onlineSubmission} />

      {verifying && (
        <p className="voucher-processing" role="status">
          <LoaderCircle size={16} aria-hidden className="spin" /> Verifying your result…
        </p>
      )}

      {onlineSubmission.status === 'verified' &&
        (onlineSubmission.newlyEarnedAchievements?.length ?? 0) > 0 && (
          <div className="result-achievement-summary" role="status">
            <Award size={16} aria-hidden />
            Verified badges earned this run:{' '}
            {onlineSubmission.newlyEarnedAchievements!.length}
          </div>
        )}

      <div className="stars" aria-label={`${result.stars} stars`}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`star ${shownStars >= n ? 'earned' : ''}`} aria-hidden="true">
            ★
          </span>
        ))}
      </div>

      <div className="result-card">
        <dl>
          <dt>Final score</dt>
          <dd>{result.score.toLocaleString()}</dd>
          <dt>Roof coverage</dt>
          <dd>{result.coveragePercent}%</dd>
          <dt>Time</dt>
          <dd>{formatDuration(result.durationMs)}</dd>
          <dt>Panels placed</dt>
          <dd>
            {result.occupiedCells} / {result.playableCells}
          </dd>
          <dt>Perfect Roof</dt>
          <dd>
            {result.perfectRoof || perfectSaved ? (
              <>
                <CheckCircle2 size={16} aria-hidden style={{ verticalAlign: 'middle' }} /> Earned
              </>
            ) : (
              'Not yet'
            )}
          </dd>
        </dl>
        {achievementIds.map((id) => (
          <div key={id} className="achievement" role="status">
            <Award size={18} aria-hidden />
            Achievement unlocked: {ACHIEVEMENTS[id].title}
          </div>
        ))}
      </div>

      <div className="complete-actions">
        {isFinalLevel && canAdvance ? (
          <button type="button" className="btn btn-primary" onClick={onCampaignComplete}>
            See your reward
            <ArrowRight size={18} aria-hidden />
          </button>
        ) : next && canAdvance ? (
          <button type="button" className="btn btn-primary" onClick={onNextLevel}>
            Next: {next.title}
            <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled>
            {verifying ? 'Verifying…' : 'Earn at least 1 star to continue'}
          </button>
        )}

        {needsRetry && onRetryVerification && (
          <button type="button" className="btn btn-secondary" onClick={onRetryVerification}>
            Retry verification
          </button>
        )}
      </div>
      {eventCampaignMode && (
        <p className="muted" style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>
          Each rooftop can only be played once in this challenge.
        </p>
      )}
    </section>
  )
}
