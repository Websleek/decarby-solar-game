import { CheckCircle2, LayoutGrid, RotateCcw, Trophy } from 'lucide-react'
import { getLevelById } from '../levels'
import { formatStopwatch } from '../engine/stopwatch'
import type { OnlineSubmissionState, TimeAttackResult } from '../types/game'
import { OnlineSubmissionBanner } from './OnlineSubmissionBanner'

type TimeAttackResultsScreenProps = {
  result: TimeAttackResult
  onlineSubmission: OnlineSubmissionState
  onRetry: () => void
  onChooseLevel: () => void
}

export function TimeAttackResultsScreen({
  result,
  onlineSubmission,
  onRetry,
  onChooseLevel,
}: TimeAttackResultsScreenProps) {
  const level = getLevelById(result.levelId)

  return (
    <section className="screen complete time-attack-results">
      <p className="brand-mark">Time Attack</p>
      <h1>{level?.title ?? 'Rooftop'} Cleared!</h1>
      {result.isNewPersonalBest && (
        <div className="pb-banner" role="status">
          <Trophy size={18} aria-hidden />
          New Personal Best!
        </div>
      )}

      <OnlineSubmissionBanner state={onlineSubmission} />

      <div className="result-card">
        <dl>
          <dt>Coverage</dt>
          <dd>
            <CheckCircle2 size={16} aria-hidden style={{ verticalAlign: 'middle' }} /> 100%
          </dd>
          <dt>Your time</dt>
          <dd>{formatStopwatch(result.durationMs)}</dd>
          <dt>Previous best</dt>
          <dd>
            {result.previousBestMs !== null
              ? formatStopwatch(result.previousBestMs)
              : '—'}
          </dd>
        </dl>
      </div>

      <div className="complete-actions">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          <RotateCcw size={16} aria-hidden />
          Retry
        </button>
        <button type="button" className="btn btn-secondary" onClick={onChooseLevel}>
          <LayoutGrid size={16} aria-hidden />
          Choose Another Level
        </button>
      </div>
    </section>
  )
}
