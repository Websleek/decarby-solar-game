import { useEffect, useState } from 'react'
import { Play, SkipForward, RotateCcw } from 'lucide-react'

type HowToPlayScreenProps = {
  onSkip: () => void
  onDone: () => void
}

const PRACTICE_ORDER = [0, 1, 3, 4]

export function HowToPlayScreen({ onSkip, onDone }: HowToPlayScreenProps) {
  const [filled, setFilled] = useState<number[]>([])
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step >= PRACTICE_ORDER.length) return
    const timer = window.setTimeout(() => {
      setFilled((prev) => [...prev, PRACTICE_ORDER[step]!])
      setStep((s) => s + 1)
    }, 550)
    return () => window.clearTimeout(timer)
  }, [step])

  const replay = (): void => {
    setFilled([])
    setStep(0)
  }

  return (
    <section className="screen howto">
      <h1>How to Play</h1>
      <div className="howto-steps">
        <article className="howto-step">
          <div className="num">1</div>
          <div>
            <h3>Pick a Panel</h3>
            <p>Tap or click a solar panel piece from the tray.</p>
          </div>
        </article>
        <article className="howto-step">
          <div className="num">2</div>
          <div>
            <h3>Drag it to the Roof</h3>
            <p>Drag onto a green spot — or tap the roof to place. Rotate if needed.</p>
          </div>
        </article>
        <article className="howto-step">
          <div className="num">3</div>
          <div>
            <h3>Fill the Roof and Earn Stars</h3>
            <p>Cover at least 60% to finish. Fill it all for three stars!</p>
          </div>
        </article>
      </div>

      <div className="practice-board">
        <strong>Practice roof</strong>
        <div className="practice-grid" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className={`practice-cell ${filled.includes(i) ? 'filled' : ''}`} />
          ))}
        </div>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          {step >= PRACTICE_ORDER.length
            ? 'Nice! A square group covers four cells.'
            : 'Watch a solar panel snap into place…'}
        </p>
      </div>

      <div className="howto-actions">
        <button type="button" className="btn btn-ghost" onClick={replay}>
          <RotateCcw size={16} aria-hidden />
          Replay
        </button>
        <button type="button" className="btn btn-secondary" onClick={onSkip}>
          <SkipForward size={16} aria-hidden />
          Skip
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          <Play size={18} fill="currentColor" aria-hidden />
          Got it — Play
        </button>
      </div>
    </section>
  )
}
