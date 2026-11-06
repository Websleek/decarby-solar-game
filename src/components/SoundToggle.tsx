import { Volume2, VolumeX } from 'lucide-react'

type SoundToggleProps = {
  enabled: boolean
  onToggle: () => void
  className?: string
}

export function SoundToggle({ enabled, onToggle, className }: SoundToggleProps) {
  return (
    <button
      type="button"
      className={`btn btn-icon sound-toggle ${className ?? ''}`}
      onClick={onToggle}
      aria-label={enabled ? 'Mute sound' : 'Enable sound'}
      title={enabled ? 'Sound on' : 'Sound off'}
    >
      {enabled ? <Volume2 size={20} aria-hidden /> : <VolumeX size={20} aria-hidden />}
    </button>
  )
}
