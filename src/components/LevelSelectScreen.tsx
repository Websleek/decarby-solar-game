import { CheckCircle2, Clock3, Lock, Play, RotateCcw, Star } from 'lucide-react'
import { listLocalLevels } from '../levels'
import { formatStopwatch } from '../engine/stopwatch'
import { getLevelScoreDisplay, isTimeAttackLevelAvailable } from '../services/localProgress'
import type { GameMode, LevelDefinition } from '../types/game'
import type { PlayerProgress } from '../types/services'
import { SoundToggle } from './SoundToggle'

type LevelSelectScreenProps = {
  progress: PlayerProgress
  mode: GameMode
  soundEnabled: boolean
  onToggleSound: () => void
  onPlayLevel: (levelId: string) => void
  onBack: () => void
}

const DIFFICULTY_LABEL: Record<LevelDefinition['difficulty'], string> = {
  beginner: 'Beginner',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
}

function RoofPreview({ level, locked }: { level: LevelDefinition; locked: boolean }) {
  const cells: { col: number; row: number; kind: 'play' | 'blocked' | 'outside' }[] = []
  const blocked = new Set(level.blockedCells.map((c) => `${c.col},${c.row}`))
  const outside = new Set(level.outsideCells.map((c) => `${c.col},${c.row}`))
  for (let row = 0; row < level.rows; row += 1) {
    for (let col = 0; col < level.columns; col += 1) {
      const key = `${col},${row}`
      let kind: 'play' | 'blocked' | 'outside' = 'play'
      if (outside.has(key)) kind = 'outside'
      else if (blocked.has(key)) kind = 'blocked'
      cells.push({ col, row, kind })
    }
  }

  const cell = 10
  const width = level.columns * cell
  const height = level.rows * cell

  return (
    <svg
      className={`level-preview ${locked ? 'locked' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="88"
      aria-hidden
    >
      <rect width={width} height={height} rx="6" fill={`#${level.visualTheme.sky.toString(16).padStart(6, '0')}`} />
      {cells.map((c) => {
        if (c.kind === 'outside') return null
        const fill =
          c.kind === 'blocked'
            ? '#8b5a3c'
            : (c.col + c.row) % 2 === 0
              ? `#${level.visualTheme.roofDeck.toString(16).padStart(6, '0')}`
              : `#${level.visualTheme.roofDeckAlt.toString(16).padStart(6, '0')}`
        return (
          <rect
            key={`${c.col}-${c.row}`}
            x={c.col * cell + 0.5}
            y={c.row * cell + 0.5}
            width={cell - 1}
            height={cell - 1}
            rx="1.5"
            fill={fill}
            opacity={locked ? 0.45 : 1}
          />
        )
      })}
    </svg>
  )
}

export function LevelSelectScreen({
  progress,
  mode,
  soundEnabled,
  onToggleSound,
  onPlayLevel,
  onBack,
}: LevelSelectScreenProps) {
  const levels = listLocalLevels()
  const isTimeAttack = mode === 'timeAttack'

  return (
    <section className="screen level-select">
      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} className="sound-toggle" />
      <header className="level-select-header">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>{isTimeAttack ? 'Time Attack Rooftops' : 'Choose a Rooftop'}</h1>
        <p className="tagline">
          {isTimeAttack
            ? 'Only Classic completions are available. Race for 100% coverage.'
            : 'Complete a challenge with at least one star to unlock the next.'}
        </p>
      </header>

      <div className="level-grid">
        {levels.map((level) => {
          const unlocked = isTimeAttack
            ? isTimeAttackLevelAvailable(progress, level.id)
            : progress.unlockedLevels.includes(level.id)
          const completed = progress.completedLevels.includes(level.id)
          const stars = progress.bestStars[level.id] ?? 0
          const scoreDisplay = getLevelScoreDisplay(progress, level)
          const bestTime = progress.timeAttackBestMs[level.id]
          const perfectRoof = progress.perfectRoofLevels.includes(level.id)

          return (
            <article
              key={level.id}
              className={`level-card ${unlocked ? 'unlocked' : 'is-locked'}`}
              aria-disabled={!unlocked}
            >
              <div className="level-card-top">
                <span className="level-number">Level {level.number}</span>
                <span className={`difficulty-pill diff-${level.difficulty}`}>
                  {DIFFICULTY_LABEL[level.difficulty]}
                </span>
              </div>
              <RoofPreview level={level} locked={!unlocked} />
              <h2>{level.title}</h2>
              <p className="level-desc">{level.description}</p>

              <div className="level-meta">
                {unlocked ? (
                  <>
                    {!isTimeAttack && (
                      <div className="level-stars" aria-label={`${stars} stars`}>
                        {[1, 2, 3].map((n) => (
                          <Star
                            key={n}
                            size={16}
                            fill={stars >= n ? 'currentColor' : 'none'}
                            className={stars >= n ? 'earned' : ''}
                            aria-hidden
                          />
                        ))}
                      </div>
                    )}
                    <span className="level-score">
                      {isTimeAttack
                        ? bestTime !== undefined
                          ? `Best ${formatStopwatch(bestTime)}`
                          : 'No time yet'
                        : scoreDisplay.currentBest !== null
                          ? `Best ${scoreDisplay.currentBest.toLocaleString()}`
                          : scoreDisplay.legacyBest !== null
                            ? `Previous layout ${scoreDisplay.legacyBest.toLocaleString()}`
                            : 'Not played'}
                    </span>
                    {perfectRoof && (
                      <span className="level-badge perfect" title="Perfect Roof">
                        <CheckCircle2 size={14} aria-hidden /> Perfect
                      </span>
                    )}
                    {!isTimeAttack && bestTime !== undefined && (
                      <span className="level-badge time" title="Time Attack best">
                        <Clock3 size={14} aria-hidden /> {formatStopwatch(bestTime)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="level-locked-label">
                    <Lock size={14} aria-hidden />{' '}
                    {isTimeAttack ? 'Complete in Classic first' : 'Locked'}
                  </span>
                )}
              </div>

              <button
                type="button"
                className={`btn ${unlocked ? 'btn-primary' : 'btn-ghost'} level-play`}
                disabled={!unlocked}
                onClick={() => onPlayLevel(level.id)}
              >
                {unlocked ? (
                  isTimeAttack ? (
                    <>
                      <Clock3 size={16} aria-hidden /> Race
                    </>
                  ) : completed ? (
                    <>
                      <RotateCcw size={16} aria-hidden /> Replay
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="currentColor" aria-hidden /> Play
                    </>
                  )
                ) : (
                  <>
                    <Lock size={16} aria-hidden /> Locked
                  </>
                )}
              </button>
            </article>
          )
        })}
      </div>

      <div className="level-select-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back to Modes
        </button>
      </div>
    </section>
  )
}
