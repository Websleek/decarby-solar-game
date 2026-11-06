import type {
  GridCoord,
  InventoryPiece,
  LevelDefinition,
  PieceTypeId,
  RoofCell,
  SolutionPlacement,
} from '../types/game'
import { cloneGrid, getPlayableCells } from './grid'
import { applyPlacement, canPlacePiece } from './placement'
import { getRotatedCells, uniqueRotations, type Rotation } from './pieces'
import type { PuzzleEngine } from './puzzleState'

export type HintSuggestion = Readonly<{
  pieceId: string
  typeId: PieceTypeId
  origin: GridCoord
  rotation: Rotation
  cells: readonly GridCoord[]
}>

export type HintResult =
  | Readonly<{ kind: 'suggestion'; suggestion: HintSuggestion }>
  | Readonly<{ kind: 'unsolvable'; message: string }>
  | Readonly<{ kind: 'alreadyComplete'; message: string }>

function firstEmpty(grid: readonly (readonly RoofCell[])[]): GridCoord | null {
  for (const cell of getPlayableCells(grid)) {
    if (cell.state === 'empty') return { col: cell.col, row: cell.row }
  }
  return null
}

/**
 * Exact-cover continuation from an already-occupied board using remaining piece types.
 * Returns one solution sequence of placements (type-level, not instance ids).
 */
export function solveRemaining(
  level: LevelDefinition,
  startingGrid: RoofCell[][],
  remainingTypes: PieceTypeId[],
  maxNodes = 1_500_000,
): SolutionPlacement[] | null {
  let grid = startingGrid
  const placements: SolutionPlacement[] = []
  let nodes = 0
  const pool = [...remainingTypes].sort((a, b) => getRotatedCells(b, 0).length - getRotatedCells(a, 0).length)

  function search(left: PieceTypeId[]): boolean {
    nodes += 1
    if (nodes > maxNodes) return false
    const anchor = firstEmpty(grid)
    if (!anchor) return left.length === 0
    if (left.length === 0) return false

    const tried = new Set<PieceTypeId>()
    for (let i = 0; i < left.length; i += 1) {
      const typeId = left[i]!
      if (tried.has(typeId)) continue
      tried.add(typeId)
      const nextLeft = [...left.slice(0, i), ...left.slice(i + 1)]

      for (const rotation of uniqueRotations(typeId)) {
        const shape = getRotatedCells(typeId, rotation)
        for (const offset of shape) {
          const origin = { col: anchor.col - offset.col, row: anchor.row - offset.row }
          const preview = canPlacePiece(
            level,
            grid,
            { typeId, rotation, instanceId: `hint-${nodes}` },
            origin,
          )
          if (!preview.valid) continue
          if (!preview.cells.some((c) => c.col === anchor.col && c.row === anchor.row)) continue

          const snapshot = grid
          grid = applyPlacement(grid, `hint-${nodes}`, preview.cells)
          placements.push({ typeId, origin, rotation })
          if (search(nextLeft)) return true
          placements.pop()
          grid = snapshot
        }
      }
    }
    return false
  }

  return search(pool) ? [...placements] : null
}

function matchPiece(
  pieces: readonly InventoryPiece[],
  typeId: PieceTypeId,
  usedIds: Set<string>,
): InventoryPiece | undefined {
  return pieces.find((p) => p.origin === null && p.typeId === typeId && !usedIds.has(p.instanceId))
}

/** Suggest one useful placement consistent with a completable continuation. */
export function requestHint(engine: PuzzleEngine): HintResult {
  if (engine.isComplete()) {
    return { kind: 'alreadyComplete', message: 'The roof is already fully covered!' }
  }

  const pieces = engine.getPieces()
  const remaining = pieces.filter((p) => p.origin === null)
  if (remaining.length === 0) {
    return {
      kind: 'unsolvable',
      message: 'No panels left, but the roof is not complete. Try Undo or Restart.',
    }
  }

  const grid = cloneGrid(engine.getGrid())
  const solution = solveRemaining(
    engine.level,
    grid,
    remaining.map((p) => p.typeId),
  )

  if (!solution || solution.length === 0) {
    return {
      kind: 'unsolvable',
      message: 'This layout cannot be completed. Undo a move or Restart to keep going.',
    }
  }

  const step = solution[0]!
  const piece = matchPiece(remaining, step.typeId, new Set())
  if (!piece) {
    return {
      kind: 'unsolvable',
      message: 'This layout cannot be completed. Undo a move or Restart to keep going.',
    }
  }

  const cells = getRotatedCells(step.typeId, step.rotation).map((offset) => ({
    col: step.origin.col + offset.col,
    row: step.origin.row + offset.row,
  }))

  return {
    kind: 'suggestion',
    suggestion: {
      pieceId: piece.instanceId,
      typeId: step.typeId,
      origin: step.origin,
      rotation: step.rotation as Rotation,
      cells,
    },
  }
}

/** Async wrapper so UI can keep the main thread responsive. */
export function requestHintAsync(engine: PuzzleEngine): Promise<HintResult> {
  return new Promise((resolve) => {
    const run = () => resolve(requestHint(engine))
    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }).requestIdleCallback
    if (typeof idle === 'function') {
      idle(() => run(), { timeout: 120 })
    } else {
      window.setTimeout(run, 0)
    }
  })
}
