import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import Phaser from 'phaser'
import { GameScene, type GameSceneCallbacks } from './GameScene'
import type { PuzzleEngine } from '../engine/puzzleState'
import type { GridCoord } from '../types/game'

export type PhaserGameHandle = {
  showHint: (cells: readonly GridCoord[]) => void
  clearHint: () => void
}

type PhaserGameProps = {
  engine: PuzzleEngine
  revision: number
  onStateChange: () => void
  onLevelAutoComplete: () => void
  onPointsEarned?: (points: number, worldX: number, worldY: number) => void
  onInvalidPlacement?: () => void
  onValidPlacement?: () => void
}

export const PhaserGame = forwardRef<PhaserGameHandle, PhaserGameProps>(function PhaserGame(
  {
    engine,
    revision,
    onStateChange,
    onLevelAutoComplete,
    onPointsEarned,
    onInvalidPlacement,
    onValidPlacement,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<GameScene | null>(null)
  const callbacksRef = useRef<GameSceneCallbacks>({
    onStateChange,
    onLevelAutoComplete,
    onPointsEarned,
    onInvalidPlacement,
    onValidPlacement,
  })

  callbacksRef.current = {
    onStateChange,
    onLevelAutoComplete,
    onPointsEarned,
    onInvalidPlacement,
    onValidPlacement,
  }

  useImperativeHandle(ref, () => ({
    showHint(cells) {
      const scene = sceneRef.current
      if (scene && scene.sys.isActive()) scene.showHint(cells)
    },
    clearHint() {
      const scene = sceneRef.current
      if (scene && scene.sys.isActive()) scene.clearHint()
    },
  }))

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return

    const parent = hostRef.current
    const width = Math.max(1, Math.floor(parent.clientWidth) || 640)
    const height = Math.max(1, Math.floor(parent.clientHeight) || 400)

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width,
      height,
      backgroundColor: '#7ec8e8',
      scale: {
        mode: Phaser.Scale.NONE,
      },
      scene: [GameScene],
      input: {
        activePointers: 2,
      },
      banner: false,
    })

    game.scene.start('GameScene', {
      engine,
      callbacks: {
        onStateChange: () => callbacksRef.current.onStateChange(),
        onLevelAutoComplete: () => callbacksRef.current.onLevelAutoComplete(),
        onPointsEarned: (points: number, x: number, y: number) =>
          callbacksRef.current.onPointsEarned?.(points, x, y),
        onInvalidPlacement: () => callbacksRef.current.onInvalidPlacement?.(),
        onValidPlacement: () => callbacksRef.current.onValidPlacement?.(),
      },
    })

    gameRef.current = game

    let frame = 0
    const onResize = (): void => {
      if (!hostRef.current || !gameRef.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!hostRef.current || !gameRef.current) return
        const w = Math.max(1, Math.floor(hostRef.current.clientWidth))
        const h = Math.max(1, Math.floor(hostRef.current.clientHeight))
        const canvas = gameRef.current.canvas
        if (canvas && canvas.width === w && canvas.height === h) return
        gameRef.current.scale.resize(w, h)
      })
    }

    const observer = new ResizeObserver(onResize)
    observer.observe(parent)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      game.destroy(true)
      gameRef.current = null
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    const scene = game.scene.getScene('GameScene') as GameScene | null
    if (scene && scene.sys.isActive()) {
      scene.refreshFromEngine()
      sceneRef.current = scene
    }
  }, [revision, engine])

  return <div ref={hostRef} className="phaser-host" role="img" aria-label="Rooftop puzzle canvas" />
})
