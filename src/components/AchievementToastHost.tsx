import { useEffect, useRef, useState } from 'react'
import { Award } from 'lucide-react'
import { playSound } from '../audio/soundEffects'
import { ACHIEVEMENT_BY_ID, type VerifiedAchievementId } from '../../shared/achievements/registry'

export type AchievementToastItem = Readonly<{
  id: string
  achievementId: VerifiedAchievementId
}>

type AchievementToastHostProps = {
  queue: readonly AchievementToastItem[]
  soundEnabled: boolean
  onDismiss: (id: string) => void
}

const DISPLAY_MS = 4200

export function AchievementToastHost({
  queue,
  soundEnabled,
  onDismiss,
}: AchievementToastHostProps) {
  const [active, setActive] = useState<AchievementToastItem | null>(null)
  const announced = useRef(new Set<string>())
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (active || queue.length === 0) return
    const next = queue[0]
    if (!next) return
    setActive(next)
    if (!announced.current.has(next.id)) {
      announced.current.add(next.id)
      playSound('achievement', soundEnabled)
    }
  }, [active, queue, soundEnabled])

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => {
      onDismiss(active.id)
      setActive(null)
    }, DISPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [active, onDismiss])

  if (!active) return null
  const def = ACHIEVEMENT_BY_ID[active.achievementId]
  if (!def) return null

  return (
    <div className="achievement-toast-layer" aria-live="polite" aria-atomic="true">
      <div
        className={`achievement-toast ${reduceMotion ? 'is-static' : ''}`}
        role="status"
      >
        <span className="achievement-toast-icon" aria-hidden>
          <Award size={22} />
        </span>
        <div className="achievement-toast-copy">
          <p className="achievement-toast-kicker">Achievement unlocked</p>
          <p className="achievement-toast-title">{def.title}</p>
          <p className="achievement-toast-body">{def.description}</p>
        </div>
      </div>
    </div>
  )
}
