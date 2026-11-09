import { cloneGrid, coveragePercent, createRoofGrid, getPlayableCells } from './grid.ts'
import { buildInventoryPieces } from './inventory.ts'
import {
  applyPlacement,
  canPlacePiece,
  clearPieceFromGrid,
  resolveAbsoluteCells,
} from './placement.ts'
import { isValidRotation } from './pieces.ts'
import { calculateScore, calculateStars, canFinishDesign } from './scoring.ts'
import {
  MAX_ACTIONS,
  type GameAction,
  type GameMode,
  type GridCoord,
  type InventoryPiece,
  type ReplayResult,
  type RoofCell,
  type Rotation,
  type VerifiableLevel,
} from './types.ts'

type MoveRecord =
  | { kind: 'place'; pieceId: string; origin: GridCoord; rotation: Rotation }
  | { kind: 'remove'; pieceId: string; origin: GridCoord; rotation: Rotation }

function fail(
  code: Extract<ReplayResult, { ok: false }>['code'],
  message: string,
): ReplayResult {
  return { ok: false, code, message }
}

function isCoord(value: unknown): value is GridCoord {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger((value as GridCoord).col) &&
    Number.isInteger((value as GridCoord).row)
  )
}

export function sanitizeActions(raw: unknown): GameAction[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length > MAX_ACTIONS) return null
  const actions: GameAction[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i]
    if (!item || typeof item !== 'object') return null
    const seq = (item as { seq?: unknown }).seq
    const kind = (item as { kind?: unknown }).kind
    const clientAtMs = (item as { clientAtMs?: unknown }).clientAtMs
    if (seq !== i || typeof kind !== 'string' || typeof clientAtMs !== 'number') return null

    if (kind === 'select') {
      const pieceId = (item as { pieceId?: unknown }).pieceId
      if (typeof pieceId !== 'string') return null
      actions.push({ seq: i, kind, pieceId, clientAtMs })
      continue
    }
    if (kind === 'rotate') {
      const pieceId = (item as { pieceId?: unknown }).pieceId
      const rotation = (item as { rotation?: unknown }).rotation
      if (typeof pieceId !== 'string' || !isValidRotation(rotation)) return null
      actions.push({ seq: i, kind, pieceId, rotation, clientAtMs })
      continue
    }
    if (kind === 'place' || kind === 'invalid_place') {
      const pieceId = (item as { pieceId?: unknown }).pieceId
      const origin = (item as { origin?: unknown }).origin
      const rotation = (item as { rotation?: unknown }).rotation
      if (typeof pieceId !== 'string' || !isCoord(origin) || !isValidRotation(rotation)) return null
      actions.push({ seq: i, kind, pieceId, origin, rotation, clientAtMs })
      continue
    }
    if (kind === 'remove') {
      const pieceId = (item as { pieceId?: unknown }).pieceId
      if (typeof pieceId !== 'string') return null
      actions.push({ seq: i, kind, pieceId, clientAtMs })
      continue
    }
    if (kind === 'undo') {
      actions.push({ seq: i, kind, clientAtMs })
      continue
    }
    if (kind === 'complete') {
      actions.push({ seq: i, kind, clientAtMs })
      continue
    }
    return null
  }
  return actions
}

/**
 * Independently replay an action log against an approved level configuration.
 * Does not trust client score/coverage; recomputes from final board state.
 */
export function validateReplay(
  level: VerifiableLevel,
  mode: GameMode,
  expectedPieceIds: readonly string[],
  actions: readonly GameAction[],
): ReplayResult {
  if (actions.length === 0) return fail('incomplete', 'No gameplay actions were provided.')
  if (actions.length > MAX_ACTIONS) return fail('too_many_actions', 'Action log exceeds limit.')

  const issued = new Set(expectedPieceIds)
  let pieces = buildInventoryPieces(level)
  if (pieces.length !== expectedPieceIds.length) {
    return fail('invalid_piece', 'Inventory size does not match issued attempt.')
  }
  for (const piece of pieces) {
    if (!issued.has(piece.instanceId)) {
      return fail('invalid_piece', 'Unexpected piece identity in inventory.')
    }
  }

  let grid = createRoofGrid(level)
  let moveHistory: MoveRecord[] = []
  let completed = false

  const findPiece = (pieceId: string): InventoryPiece | undefined =>
    pieces.find((p) => p.instanceId === pieceId)

  const updatePiece = (pieceId: string, patch: Partial<InventoryPiece>): void => {
    pieces = pieces.map((p) => (p.instanceId === pieceId ? { ...p, ...patch } : p))
  }

  for (const action of actions) {
    if (completed && action.kind !== 'complete') {
      return fail('invalid_action', 'Actions after completion are not allowed.')
    }

    if (action.kind === 'select') {
      if (!findPiece(action.pieceId)) return fail('invalid_piece', 'Unknown piece selected.')
      continue
    }

    if (action.kind === 'rotate') {
      const piece = findPiece(action.pieceId)
      if (!piece) return fail('invalid_piece', 'Unknown piece rotated.')
      if (piece.origin) {
        const working = clearPieceFromGrid(cloneGrid(grid), action.pieceId)
        const preview = canPlacePiece(
          level,
          working,
          { ...piece, rotation: action.rotation },
          piece.origin,
        )
        if (!preview.valid) return fail('invalid_rotation', 'In-place rotation is invalid.')
        grid = applyPlacement(working, action.pieceId, preview.cells)
        updatePiece(action.pieceId, { rotation: action.rotation })
      } else {
        updatePiece(action.pieceId, { rotation: action.rotation })
      }
      continue
    }

    if (action.kind === 'invalid_place') {
      // Telemetry only — does not mutate board state. Used for perfect_fit awards.
      if (!findPiece(action.pieceId)) return fail('invalid_piece', 'Unknown piece in invalid placement.')
      continue
    }

    if (action.kind === 'place') {
      const piece = findPiece(action.pieceId)
      if (!piece) return fail('invalid_piece', 'Unknown piece placed.')
      if (piece.rotation !== action.rotation) {
        return fail('invalid_rotation', 'Placement rotation does not match piece state.')
      }
      let working = cloneGrid(grid)
      if (piece.origin !== null) {
        working = clearPieceFromGrid(working, action.pieceId)
        moveHistory = [
          ...moveHistory,
          {
            kind: 'remove',
            pieceId: action.pieceId,
            origin: piece.origin,
            rotation: piece.rotation,
          },
        ]
      }
      const preview = canPlacePiece(level, working, piece, action.origin)
      if (!preview.valid) return fail('invalid_placement', 'Placement is not valid on the roof.')
      grid = applyPlacement(working, action.pieceId, preview.cells)
      updatePiece(action.pieceId, { origin: action.origin })
      moveHistory = [
        ...moveHistory,
        {
          kind: 'place',
          pieceId: action.pieceId,
          origin: action.origin,
          rotation: action.rotation,
        },
      ]
      continue
    }

    if (action.kind === 'remove') {
      const piece = findPiece(action.pieceId)
      if (!piece || piece.origin === null) {
        return fail('invalid_action', 'Cannot remove an unplaced piece.')
      }
      moveHistory = [
        ...moveHistory,
        {
          kind: 'remove',
          pieceId: action.pieceId,
          origin: piece.origin,
          rotation: piece.rotation,
        },
      ]
      grid = clearPieceFromGrid(grid, action.pieceId)
      updatePiece(action.pieceId, { origin: null })
      continue
    }

    if (action.kind === 'undo') {
      if (moveHistory.length === 0) return fail('undo_inconsistent', 'Nothing to undo.')
      const last = moveHistory[moveHistory.length - 1]!
      moveHistory = moveHistory.slice(0, -1)
      if (last.kind === 'place') {
        grid = clearPieceFromGrid(grid, last.pieceId)
        const prior = moveHistory[moveHistory.length - 1]
        if (prior && prior.kind === 'remove' && prior.pieceId === last.pieceId) {
          moveHistory = moveHistory.slice(0, -1)
          const cells = resolveAbsoluteCells(
            { typeId: findPiece(last.pieceId)!.typeId, rotation: prior.rotation },
            prior.origin,
          )
          grid = applyPlacement(grid, last.pieceId, cells)
          updatePiece(last.pieceId, { origin: prior.origin, rotation: prior.rotation })
        } else {
          updatePiece(last.pieceId, { origin: null })
        }
      } else {
        const piece = findPiece(last.pieceId)
        if (!piece) return fail('undo_inconsistent', 'Undo references unknown piece.')
        const cells = resolveAbsoluteCells(
          { typeId: piece.typeId, rotation: last.rotation },
          last.origin,
        )
        grid = applyPlacement(grid, last.pieceId, cells)
        updatePiece(last.pieceId, { origin: last.origin, rotation: last.rotation })
      }
      continue
    }

    if (action.kind === 'complete') {
      completed = true
      continue
    }

    return fail('invalid_action', 'Unsupported action kind.')
  }

  if (!completed) return fail('incomplete', 'Attempt is missing a completion action.')

  const coverage = coveragePercent(grid)
  const playableCells = getPlayableCells(grid).length
  const occupiedCells = getPlayableCells(grid).filter((c) => c.state === 'occupied').length

  if (mode === 'timeAttack') {
    if (coverage < 100) {
      return fail('mode_rules', 'Time Attack requires 100% valid coverage.')
    }
  } else if (!canFinishDesign(level, grid)) {
    return fail('incomplete', 'Coverage is below the level finish threshold.')
  }

  const score = calculateScore(level, grid, true)
  const stars = calculateStars(coverage, level.starThresholds, true)

  return {
    ok: true,
    coveragePercent: coverage,
    occupiedCells,
    playableCells,
    score,
    stars,
    completed: true,
    isPerfectCoverage: coverage >= 100,
  }
}

export function assertBoardEmptyExcept(
  grid: readonly (readonly RoofCell[])[],
  allowed: ReadonlySet<string>,
): boolean {
  for (const cell of getPlayableCells(grid)) {
    if (cell.state === 'occupied' && cell.occupiedBy && !allowed.has(cell.occupiedBy)) {
      return false
    }
  }
  return true
}
