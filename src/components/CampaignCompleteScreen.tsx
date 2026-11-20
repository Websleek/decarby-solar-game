import { Award, Home, ArrowRight, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { CampaignCompleteView } from '../../shared/campaign/types'
import { MAX_CAMPAIGN_STARS } from '../../shared/campaign/rewardTiers'

type CampaignCompleteScreenProps = {
  view: CampaignCompleteView
  onContinuePlaceholder: () => void
  onHome: () => void
  onRetryVerification?: () => void
}

function StarRow({ stars }: { stars: number }) {
  const safe = Math.max(0, Math.min(3, Math.floor(stars)))
  return (
    <span className="promo-star-row" aria-label={`${safe} of 3 stars`}>
      {[0, 1, 2].map((index) => (
        <span key={index} className={index < safe ? 'promo-star is-filled' : 'promo-star is-empty'}>
          ★
        </span>
      ))}
    </span>
  )
}

export function CampaignCompleteScreen({
  view,
  onContinuePlaceholder,
  onHome,
  onRetryVerification,
}: CampaignCompleteScreenProps) {
  const hasReward = Boolean(view.rewardLabel && view.rewardAmountCents > 0)

  return (
    <section className="screen complete campaign-complete promo-campaign-complete">
      <p className="brand-mark">
        <span>Decarby</span> Solar
      </p>
      <h1>Congratulations, Solar Champion!</h1>
      <p className="tagline">
        You powered all three rooftops. Review your score and reward, then claim your voucher.
      </p>

      <p className="promo-player-chip" aria-label="Player nickname">
        Player: <strong>{view.nickname}</strong>
      </p>

      <div className="result-card promo-summary-card" aria-label="Campaign summary">
        <div className="promo-stats-row">
          <p className="promo-stat">
            <span>Stars</span>
            <strong>
              {view.totalStars} / {MAX_CAMPAIGN_STARS}
            </strong>
          </p>
          <p className="promo-stat">
            <span>Combined score</span>
            <strong>{view.totalScore.toLocaleString()}</strong>
          </p>
          <p className="promo-stat">
            <span>Reward earned</span>
            <strong>{hasReward ? view.rewardLabel : 'Pending'}</strong>
          </p>
        </div>
      </div>

      <div className="result-card promo-reward-card">
        {hasReward ? (
          <div className="promo-reward-reveal" role="status">
            <Award size={22} aria-hidden />
            <div>
              <p>Congratulations! You’ve unlocked your Decarby Solar reward.</p>
              <strong>Your reward: {view.rewardLabel}</strong>
            </div>
          </div>
        ) : (
          <div className="promo-reward-reveal" role="status">
            <Award size={22} aria-hidden />
            <div>
              <p>Your reward is almost ready</p>
              <strong>Complete verification to continue</strong>
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
            ? 'Result verified'
            : view.run.serverBacked
              ? 'Waiting for verification'
              : 'Not server-verified'}
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
                {level.stars == null ? '—' : <StarRow stars={level.stars} />}
              </strong>
              <em>{level.status === 'verified' ? 'verified' : level.status === 'local_complete' ? 'done' : level.status}</em>
            </li>
          ))}
        </ul>
      </div>

      <div className="complete-actions">
        {view.serverVerified ? (
          <button type="button" className="btn btn-primary" onClick={onContinuePlaceholder}>
            <ArrowRight size={16} aria-hidden />
            Claim Your Reward
          </button>
        ) : null}
        {!view.serverVerified && onRetryVerification && (
          <button type="button" className="btn btn-primary" onClick={onRetryVerification}>
            {view.run.serverBacked ? 'Retry verification' : 'Start new verified challenge'}
          </button>
        )}
        {!view.serverVerified && view.run.serverBacked && (
          <button type="button" className="btn btn-secondary" onClick={onContinuePlaceholder}>
            <ArrowRight size={16} aria-hidden />
            Continue anyway
          </button>
        )}
        <button type="button" className="btn btn-tertiary" onClick={onHome}>
          <Home size={16} aria-hidden />
          Home
        </button>
      </div>
    </section>
  )
}
