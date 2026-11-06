import type { SolutionPlacement } from '../types/game'
import type { PuzzleEngine } from './puzzleState'

/** Apply a verified solution to an engine (dev/test helper — not shown to players). */
export function applySolution(engine: PuzzleEngine, solution: readonly SolutionPlacement[]): boolean {
  for (const step of solution) {
    const piece = engine.getPieces().find((p) => p.typeId === step.typeId && p.origin === null)
    if (!piece) return false

    let guard = 0
    let rotation = piece.rotation
    while (rotation !== step.rotation && guard < 4) {
      const next = engine.rotatePiece(piece.instanceId)
      if (next === null) return false
      rotation = next
      guard += 1
    }

    if (!engine.placePiece(piece.instanceId, step.origin)) return false
  }
  return true
}
