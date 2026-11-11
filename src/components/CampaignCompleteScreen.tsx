import { Award, Home, ArrowRight, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { CampaignCompleteView } from '../../shared/campaign/types'

type CampaignCompleteScreenProps = {
  view: CampaignCompleteView
  onContinuePlaceholder: () => void
  onHome: () => void
  onExploreModes: () => void
}

export function CampaignCompleteScreen({
  view,
  onContinuePlaceholder,
  onHome,
  onExploreModes,
}: CampaignCompleteScreenProps) {
  return (
    <section className="screen complete campaign-complete promo-campaign-complete">
      <p className="brand-mark">
        <span>Decarby</span> Solar
      </p>
      <h1>Congratulations, Solar Champion!</h1>
      <p className="tagline">
        You powered every rooftop in this campaign run. Review your reward, then continue when you
        are ready.
      </p>

      <p className="promo-player-chip" aria-label="Player nickname">
        Player <strong>{view.nickname}</strong>
      </p>

      <div className="result-card promo-summary-card" aria-label="Campaign summary">
        <div className="promo-stats-row">
          <p className="promo-stat">
            <span>Stars</span>
            <strong>
              {view.totalStars} / 15
            </strong>
          </p>
          <p className="promo-stat">
            <span>Combined score</span>
            <strong>{view.totalScore.toLocaleString()}</strong>
          </p>
        </div>
      </div>

      <div className="result-card promo-reward-card">
        {view.rewardLabel ? (
          <div className="promo-reward-reveal" role="status">
            <Award size={22} aria-hidden />
            <div>
              <p>Your eligible reward</p>
              <strong>{view.rewardLabel}</strong>
            </div>
          </div>
        ) : (
          <div className="promo-reward-reveal is-ineligible" role="status">
            <Award size={22} aria-hidden />
            <div>
              <p>No promotional tier unlocked yet</p>
              <strong>Keep practising for A$50–A$500 OFF</strong>
            </div>
          </div>
        )}

        <p className={`promo-verify ${view.serverVerified ? 'is-verified' : 'is-provisional'}`}>
          {view.serverVerified ? (
            <ShieldCheck size={16} aria-hidden />
          ) : (
            <ShieldAlert size={16} aria-hidden />
          )}
          {view.serverVerified
            ? 'Server verified campaign result'
            : 'Provisional / not fully verified'}
        </p>
        <p className="muted promo-eligible-note">{view.voucherEligibleMessaging}</p>
      </div>

      <div className="promo-levels-panel">
        <h2>Rooftop results</h2>
        <ul className="promo-level-stars" aria-label="Stars by rooftop">
          {view.run.levels.map((level) => (
            <li key={level.levelId}>
              <span>
                L{level.levelNumber} {level.levelTitle}
              </span>
              <strong>
                {level.stars == null
                  ? '—'
                  : `${'★'.repeat(level.stars)}${'☆'.repeat(3 - level.stars)}`}
              </strong>
              <em>{level.status}</em>
            </li>
          ))}
        </ul>
      </div>

      <div className="complete-actions">
        <button type="button" className="btn btn-primary" onClick={onContinuePlaceholder}>
          <ArrowRight size={16} aria-hidden />
          {view.nextStepLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onExploreModes}>
          More ways to play
        </button>
        <button type="button" className="btn btn-tertiary" onClick={onHome}>
          <Home size={16} aria-hidden />
          Home
        </button>
      </div>
    </section>
  )
}
