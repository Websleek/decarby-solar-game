import { Play, HelpCircle } from 'lucide-react'
import { HouseIllustration } from './HouseIllustration'
import { SoundToggle } from './SoundToggle'

type WelcomeScreenProps = {
  soundEnabled: boolean
  onToggleSound: () => void
  onPlay: () => void
  onHowToPlay: () => void
}

export function WelcomeScreen({
  soundEnabled,
  onToggleSound,
  onPlay,
  onHowToPlay,
}: WelcomeScreenProps) {
  return (
    <section className="screen welcome">
      <div className="welcome-decor" aria-hidden="true">
        <div className="welcome-sunburst" />
        <div className="welcome-cloud c1" />
        <div className="welcome-cloud c2" />
      </div>

      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} className="sound-toggle" />

      <div className="welcome-content">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>Solar Roof Challenge</h1>
        <p className="tagline">Fit the Panels. Power the Roof. Become a Solar Champion!</p>
        <HouseIllustration className="house-illustration" />
        <div className="welcome-actions">
          <button type="button" className="btn btn-primary" onClick={onPlay}>
            <Play size={22} fill="currentColor" aria-hidden />
            Play Now
          </button>
          <button type="button" className="btn btn-secondary" onClick={onHowToPlay}>
            <HelpCircle size={18} aria-hidden />
            How to Play
          </button>
        </div>
      </div>
    </section>
  )
}
