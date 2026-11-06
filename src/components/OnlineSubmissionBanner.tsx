import { CloudOff, LoaderCircle, ShieldCheck, ShieldX } from 'lucide-react'
import type { OnlineSubmissionState } from '../types/game'

type OnlineSubmissionBannerProps = {
  state: OnlineSubmissionState
}

export function OnlineSubmissionBanner({ state }: OnlineSubmissionBannerProps) {
  if (state.status === 'idle') return null

  if (state.status === 'submitting') {
    return (
      <div className="online-submit-banner is-pending" role="status">
        <LoaderCircle size={16} className="spin" aria-hidden />
        Submitting for server verification…
      </div>
    )
  }

  if (state.status === 'verified') {
    return (
      <div className="online-submit-banner is-verified" role="status">
        <ShieldCheck size={16} aria-hidden />
        Verified online — score {state.verifiedScore.toLocaleString()} · {state.verifiedStars}★
      </div>
    )
  }

  if (state.status === 'rejected') {
    return (
      <div className="online-submit-banner is-rejected" role="status">
        <ShieldX size={16} aria-hidden />
        Online verification rejected. Local progress is still saved.
      </div>
    )
  }

  return (
    <div className="online-submit-banner is-offline" role="status">
      <CloudOff size={16} aria-hidden />
      {state.message}
    </div>
  )
}
