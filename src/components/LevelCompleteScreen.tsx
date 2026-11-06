import { useEffect, useState } from 'react'
import { Award, CheckCircle2, Play, ArrowRight, LayoutGrid, Trophy } from 'lucide-react'
import { getLevelById, getNextLevel } from '../levels'
import { formatDuration } from '../engine/scoring'
import { formatStopwatch } from '../engine/stopwatch'
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
  onReplay: () => void
  onNextLevel: () => void
  onLevelSelect: () => void
  onCampaignComplete: () => void
}

export function LevelCompleteScreen({
  result,
  progress,
  onlineSubmission,
  nextUnlocked,
  isFinalLevel,
  onReplay,
  onNextLevel,
  onLevelSelect,
  onCampaignComplete,
}: LevelCompleteScreenProps) {
  const [shownStars, setShownStars] = useState(0)
  const level = getLevelById(result.levelId)
  const next = getNextLevel(result.levelId)
  const bestTime = progress.timeAttackBestMs[result.levelId]
  const perfectSaved = progress.perfectRoofLevels.includes(result.levelId)

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

  return (
    <section className="screen complete">
      <p className="brand-mark">Level {level?.number ?? ''}</p>
      <h1>
        {result.isPerfect
          ? `${level?.title ?? 'Roof'} Perfect!`
          : `${level?.title ?? 'Design'} Complete!`}
      </h1>

      {result.isNewScoreBest && (
        <div className="pb-banner" role="status">
          <Trophy size={18} aria-hidden />
          New personal best score!
        </div>
      )}

      <OnlineSubmissionBanner state={onlineSubmission} />

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
          {bestTime !== undefined && (
            <>
              <dt>Time Attack best</dt>
              <dd>{formatStopwatch(bestTime)}</dd>
            </>
          )}
        </dl>
        {achievementIds.map((id) => (
          <div key={id} className="achievement" role="status">
            <Award size={18} aria-hidden />
            Achievement unlocked: {ACHIEVEMENTS[id].title}
          </div>
        ))}
      </div>

      <div className="complete-actions">
        <button type="button" className="btn btn-secondary" onClick={onReplay}>
          <Play size={16} aria-hidden />
          Replay Level
        </button>
        {isFinalLevel && result.stars >= 1 ? (
          <button type="button" className="btn btn-primary" onClick={onCampaignComplete}>
            Celebrate
            <ArrowRight size={18} aria-hidden />
          </button>
        ) : next && nextUnlocked ? (
          <button type="button" className="btn btn-primary" onClick={onNextLevel}>
            Next: {next.title}
            <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onLevelSelect}>
            <LayoutGrid size={16} aria-hidden />
            Level Select
          </button>
        )}
      </div>
      {!isFinalLevel && next && !nextUnlocked && (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.9rem' }}>
          Earn at least one star to unlock {next.title}
        </p>
      )}
    </section>
  )
}
