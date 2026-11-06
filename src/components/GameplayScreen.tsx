import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RotateCw,
  Undo2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Home,
  Timer,
  Percent,
  Zap,
  Lightbulb,
} from 'lucide-react'
import { PhaserGame, type PhaserGameHandle } from '../phaser/PhaserGame'
import type { PuzzleEngine } from '../engine/puzzleState'
import { buildLevelResult, formatDuration } from '../engine/scoring'
import { createStopwatch, formatStopwatch } from '../engine/stopwatch'
import { createAttemptCounters, resetAttemptCounters } from '../engine/perfectRoof'
import { requestHintAsync } from '../engine/hint'
import { playSound, unlockAudio } from '../audio/soundEffects'
import type { GameMode, LevelResult, TimeAttackResult } from '../types/game'
import { PanelTray } from './PanelTray'

type GameplayScreenProps = {
  engine: PuzzleEngine
  mode: GameMode
  soundEnabled: boolean
  previousBestScore?: number
  previousBestTimeMs?: number | null
  onlineAttemptActive?: boolean
  onComplete: (result: LevelResult) => void
  onTimeAttackComplete: (result: TimeAttackResult) => void
  onExit: () => void
}

type FloatPoint = { id: number; points: number; x: number; y: number }

export function GameplayScreen({
  engine,
  mode,
  soundEnabled,
  previousBestScore = 0,
  previousBestTimeMs = null,
  onlineAttemptActive = false,
  onComplete,
  onTimeAttackComplete,
  onExit,
}: GameplayScreenProps) {
  const [revision, setRevision] = useState(0)
  const [tick, setTick] = useState(0)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [floats, setFloats] = useState<FloatPoint[]>([])
  const [hintMessage, setHintMessage] = useState<string | null>(null)
  const [hintBusy, setHintBusy] = useState(false)
  const [hintPieceId, setHintPieceId] = useState<string | null>(null)
  const completedRef = useRef(false)
  const floatIdRef = useRef(0)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const phaserRef = useRef<PhaserGameHandle>(null)
  const stopwatchRef = useRef(createStopwatch())
  const countersRef = useRef(createAttemptCounters())
  const classicStartedAtRef = useRef(Date.now())

  const bump = useCallback(() => setRevision((r) => r + 1), [])
  const isTimeAttack = mode === 'timeAttack'

  useEffect(() => {
    void unlockAudio()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), isTimeAttack ? 50 : 1000)
    return () => window.clearInterval(id)
  }, [isTimeAttack])

  const pieces = useMemo(() => engine.getPieces(), [engine, revision])
  const selectedPieceId = engine.getSelectedPieceId()
  const coverage = engine.getCoverage()
  const canFinishClassic = engine.canFinish()
  const canFinishTimeAttack = engine.isComplete()
  const canFinish = isTimeAttack ? canFinishTimeAttack : canFinishClassic

  const elapsed = isTimeAttack
    ? formatStopwatch(stopwatchRef.current.elapsedMs())
    : formatDuration(Date.now() - classicStartedAtRef.current)
  void tick

  const canRemove =
    !!selectedPieceId &&
    pieces.find((p) => p.instanceId === selectedPieceId)?.origin !== null

  const playableCells =
    engine.level.columns * engine.level.rows -
    engine.level.blockedCells.length -
    engine.level.outsideCells.length
  const occupiedPoints =
    Math.round((coverage / 100) * playableCells) * engine.level.scoring.pointsPerCell

  const clearHintUi = useCallback(() => {
    setHintPieceId(null)
    setHintMessage(null)
    phaserRef.current?.clearHint()
  }, [])

  const finishClassic = useCallback(() => {
    if (completedRef.current) return
    if (!engine.canFinish() && !engine.isComplete()) return
    completedRef.current = true
    clearHintUi()
    const result = buildLevelResult(
      engine.level,
      engine.getGrid(),
      Date.now() - classicStartedAtRef.current,
      true,
      {
        mode: 'classic',
        counters: { ...countersRef.current },
        previousBestScore,
      },
    )
    playSound('complete', soundEnabled)
    if (result.perfectRoof || result.achievements.includes('perfect-roof')) {
      playSound('achievement', soundEnabled)
    }
    if (result.isNewScoreBest) {
      playSound('personalBest', soundEnabled)
    }
    onComplete(result)
  }, [clearHintUi, engine, onComplete, previousBestScore, soundEnabled])

  const finishTimeAttack = useCallback(() => {
    if (completedRef.current) return
    if (!engine.isComplete()) return
    completedRef.current = true
    const durationMs = Math.round(stopwatchRef.current.elapsedMs())
    const previous = previousBestTimeMs ?? null
    const isNewPersonalBest = previous === null || durationMs < previous
    playSound('complete', soundEnabled)
    if (isNewPersonalBest) playSound('personalBest', soundEnabled)
    onTimeAttackComplete({
      levelId: engine.level.id,
      durationMs,
      previousBestMs: previous,
      isNewPersonalBest,
      coveragePercent: engine.getCoverage(),
    })
  }, [engine, onTimeAttackComplete, previousBestTimeMs, soundEnabled])

  const handleAutoComplete = useCallback(() => {
    if (isTimeAttack) finishTimeAttack()
    else finishClassic()
  }, [finishClassic, finishTimeAttack, isTimeAttack])

  const handlePointsEarned = useCallback((points: number, worldX: number, worldY: number) => {
    const wrap = canvasWrapRef.current
    if (!wrap) return
    const host = wrap.querySelector('.phaser-host') as HTMLElement | null
    if (!host) return
    const canvas = host.querySelector('canvas')
    const scaleX = canvas ? host.clientWidth / (canvas.width || host.clientWidth) : 1
    const scaleY = canvas ? host.clientHeight / (canvas.height || host.clientHeight) : 1
    const id = ++floatIdRef.current
    setFloats((prev) => [...prev, { id, points, x: worldX * scaleX, y: worldY * scaleY }])
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id))
    }, 900)
  }, [])

  const handleValidPlacement = useCallback(() => {
    clearHintUi()
    playSound('place', soundEnabled)
  }, [clearHintUi, soundEnabled])

  const handleInvalidPlacement = useCallback(() => {
    countersRef.current.invalidAttempts += 1
    playSound('invalid', soundEnabled)
    bump()
  }, [bump, soundEnabled])

  const handleSelect = (pieceId: string): void => {
    void unlockAudio()
    engine.selectPiece(pieceId)
    bump()
  }

  const handleRotate = (): void => {
    void unlockAudio()
    engine.rotateSelected()
    playSound('rotate', soundEnabled)
    bump()
  }

  const handleUndo = (): void => {
    engine.undo()
    clearHintUi()
    bump()
  }

  const handleRemove = (): void => {
    const id = engine.getSelectedPieceId()
    if (!id) return
    engine.removePiece(id)
    clearHintUi()
    bump()
  }

  const handleRestart = (): void => {
    engine.restart()
    resetAttemptCounters(countersRef.current)
    stopwatchRef.current.reset()
    classicStartedAtRef.current = Date.now()
    setConfirmRestart(false)
    completedRef.current = false
    clearHintUi()
    bump()
  }

  const handleHint = async (): Promise<void> => {
    if (isTimeAttack || hintBusy) return
    void unlockAudio()
    setHintBusy(true)
    setHintMessage(null)
    try {
      const result = await requestHintAsync(engine)
      if (result.kind === 'suggestion') {
        countersRef.current.hintsUsed += 1
        setHintPieceId(result.suggestion.pieceId)
        engine.selectPiece(result.suggestion.pieceId)
        let guard = 0
        while (
          engine.getPieces().find((p) => p.instanceId === result.suggestion.pieceId)?.rotation !==
            result.suggestion.rotation &&
          guard < 4
        ) {
          engine.rotatePiece(result.suggestion.pieceId)
          guard += 1
        }
        phaserRef.current?.showHint(result.suggestion.cells)
        setHintMessage(
          `Try placing the highlighted ${result.suggestion.typeId} panel on the glowing cells.`,
        )
        playSound('hint', soundEnabled)
        bump()
      } else {
        phaserRef.current?.clearHint()
        setHintPieceId(null)
        setHintMessage(result.message)
        playSound('invalid', soundEnabled)
      }
    } finally {
      setHintBusy(false)
    }
  }

  return (
    <section className={`screen gameplay ${isTimeAttack ? 'mode-time-attack' : 'mode-classic'}`}>
      <header className="game-header">
        <div className="game-header-main">
          <div className="game-title-row">
            <h1>{engine.level.title}</h1>
            {isTimeAttack && <span className="mode-pill">Time Attack</span>}
            {onlineAttemptActive && <span className="mode-pill online-pill">Online attempt</span>}
          </div>
          <div
            className={`progress-bar ${coverage >= 100 ? 'is-full' : ''}`}
            aria-label={`Coverage ${coverage}%`}
          >
            <span style={{ width: `${coverage}%` }} />
          </div>
        </div>
        <div className="stats-row">
          {!isTimeAttack && (
            <span className="stat-chip">
              <Zap aria-hidden />
              <span>
                Points <strong>{occupiedPoints}</strong>
              </span>
            </span>
          )}
          <span className="stat-chip">
            <Percent aria-hidden />
            <span>
              Cover <strong>{coverage}%</strong>
            </span>
          </span>
          <span className={`stat-chip ${isTimeAttack ? 'stat-timer' : ''}`}>
            <Timer aria-hidden />
            <span>
              {isTimeAttack ? 'Stopwatch' : 'Time'} <strong>{elapsed}</strong>
            </span>
          </span>
        </div>
        {!isTimeAttack && previousBestScore > 0 && (
          <p className="best-line">Personal best score: {previousBestScore.toLocaleString()}</p>
        )}
        {isTimeAttack && previousBestTimeMs !== null && (
          <p className="best-line">Personal best: {formatStopwatch(previousBestTimeMs)}</p>
        )}
      </header>

      <div className="game-layout">
        <div className="canvas-wrap" ref={canvasWrapRef}>
          <PhaserGame
            ref={phaserRef}
            engine={engine}
            revision={revision}
            onStateChange={bump}
            onLevelAutoComplete={handleAutoComplete}
            onPointsEarned={handlePointsEarned}
            onInvalidPlacement={handleInvalidPlacement}
            onValidPlacement={handleValidPlacement}
          />
          {floats.map((f) => (
            <div
              key={f.id}
              className="points-float"
              style={{ left: f.x, top: f.y }}
              aria-hidden
            >
              +{f.points}
            </div>
          ))}
        </div>

        <aside className="side-panel">
          <PanelTray
            pieces={pieces}
            selectedPieceId={selectedPieceId}
            hintPieceId={hintPieceId}
            onSelect={handleSelect}
          />

          {hintMessage && (
            <p className="hint-banner" role="status">
              {hintMessage}
            </p>
          )}

          <div className="controls">
            <button
              type="button"
              className="btn btn-secondary btn-control"
              onClick={handleRotate}
              disabled={!selectedPieceId}
            >
              <RotateCw aria-hidden />
              Rotate
            </button>
            <button type="button" className="btn btn-secondary btn-control" onClick={handleUndo}>
              <Undo2 aria-hidden />
              Undo
            </button>
            <button
              type="button"
              className="btn btn-tertiary btn-control"
              onClick={handleRemove}
              disabled={!canRemove}
            >
              <Trash2 aria-hidden />
              Remove
            </button>
            <button
              type="button"
              className="btn btn-tertiary btn-control"
              onClick={() => setConfirmRestart(true)}
            >
              <RefreshCw aria-hidden />
              Restart
            </button>
            {!isTimeAttack && (
              <button
                type="button"
                className="btn btn-secondary btn-control btn-hint"
                onClick={() => void handleHint()}
                disabled={hintBusy}
              >
                <Lightbulb aria-hidden />
                {hintBusy ? 'Thinking…' : 'Hint'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-accent btn-finish"
              disabled={!canFinish}
              onClick={() => (isTimeAttack ? finishTimeAttack() : finishClassic())}
            >
              <CheckCircle2 size={18} aria-hidden />
              {isTimeAttack ? 'Finish Run' : 'Finish Design'}
            </button>
            <button type="button" className="btn btn-ghost btn-home" onClick={onExit}>
              <Home size={16} aria-hidden />
              {isTimeAttack ? 'Leave Run' : 'Home'}
            </button>
          </div>
        </aside>
      </div>

      {confirmRestart && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="restart-title">
          <div className="modal">
            <h2 id="restart-title">Restart level?</h2>
            <p>
              {isTimeAttack
                ? 'This starts a fresh Time Attack attempt.'
                : 'Your current rooftop layout will be cleared.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmRestart(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleRestart}>
                Restart
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
