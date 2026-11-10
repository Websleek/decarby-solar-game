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
        Nice work, <strong>{view.nickname}</strong> — you powered every rooftop in this campaign run.
      </p>

      <div className="result-card promo-reward-card">
        <p className="promo-reward-kicker">Campaign stars</p>
        <p className="promo-reward-stars">
          You earned <strong>{view.totalStars}</strong> of <strong>15</strong> stars
        </p>
        <p className="promo-reward-score">Combined score: {view.totalScore.toLocaleString()}</p>

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
          {view.serverVerified ? <ShieldCheck size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}
          {view.serverVerified ? 'Server verified campaign result' : 'Provisional / not fully verified'}
        </p>
        <p className="muted">{view.voucherEligibleMessaging}</p>
        <p className="muted">
          Discount subject to approved promotional terms. Continue only if you want to submit
          adult contact details for a voucher.
        </p>
      </div>

      <ul className="promo-level-stars" aria-label="Stars by rooftop">
        {view.run.levels.map((level) => (
          <li key={level.levelId}>
            <span>
              L{level.levelNumber} {level.levelTitle}
            </span>
            <strong>
              {level.stars == null ? '—' : `${'★'.repeat(level.stars)}${'☆'.repeat(3 - level.stars)}`}
            </strong>
            <em>{level.status}</em>
          </li>
        ))}
      </ul>

      <div className="complete-actions">
        <button type="button" className="btn btn-primary" onClick={onContinuePlaceholder}>
          <ArrowRight size={16} aria-hidden />
          {view.nextStepLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onExploreModes}>
          More ways to play
        </button>
        <button type="button" className="btn btn-secondary" onClick={onHome}>
          <Home size={16} aria-hidden />
          Home
        </button>
      </div>
    </section>
  )
}
