import { Award, Home, RotateCcw } from 'lucide-react'
import type { PlayerProgress } from '../types/services'

type CampaignCompleteScreenProps = {
  progress: PlayerProgress
  onReplayFinal: () => void
  onLevelSelect: () => void
  onHome: () => void
}

export function CampaignCompleteScreen({
  progress,
  onReplayFinal,
  onLevelSelect,
  onHome,
}: CampaignCompleteScreenProps) {
  const totalScore = Object.values(progress.bestScores).reduce((sum, n) => sum + n, 0)

  return (
    <section className="screen complete campaign-complete">
      <h1>Solar Champion!</h1>
      <p className="tagline">You powered every Decarby rooftop. Outstanding work!</p>

      <div className="result-card">
        <dl>
          <dt>Rooftops completed</dt>
          <dd>{progress.completedLevels.length} / 5</dd>
          <dt>Combined best score</dt>
          <dd>{totalScore.toLocaleString()}</dd>
        </dl>
        <div className="achievement" role="status">
          <Award size={18} aria-hidden />
          Achievement unlocked: Decarby Solar Champion
        </div>
      </div>

      <div className="complete-actions">
        <button type="button" className="btn btn-secondary" onClick={onReplayFinal}>
          <RotateCcw size={16} aria-hidden />
          Replay Final Level
        </button>
        <button type="button" className="btn btn-primary" onClick={onLevelSelect}>
          Level Select
        </button>
        <button type="button" className="btn btn-ghost" onClick={onHome}>
          <Home size={16} aria-hidden />
          Home
        </button>
      </div>
    </section>
  )
}
