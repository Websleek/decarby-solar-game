import type {
  GridCoord,
  InventoryPiece,
  LevelDefinition,
  MoveRecord,
  PlacementPreview,
  PuzzleSnapshot,
  RoofCell,
} from '../types/game'
import type { GameAction } from '../../shared/verification/types'
import {
  cloneGrid,
  coveragePercent,
  createRoofGrid,
  isFullyCovered,
} from './grid'
import {
  applyPlacement,
  canPlacePiece,
  clearPieceFromGrid,
  resolveAbsoluteCells,
} from './placement'
import { nextRotation, type Rotation } from './pieces'
import { canFinishDesign } from './scoring'

export type PuzzleEngine = {
  readonly level: LevelDefinition
  getGrid(): RoofCell[][]
  getPieces(): InventoryPiece[]
  getSelectedPieceId(): string | null
  getCoverage(): number
  isComplete(): boolean
  canFinish(): boolean
  getStartedAt(): number
  getActionLog(): readonly GameAction[]
  clearActionLog(): void
  recordCompleteAction(): void
  /** Count of invalid_place actions recorded in the current online attempt log. */
  getInvalidPlacementCount(): number
  selectPiece(pieceId: string | null): void
  rotateSelected(): Rotation | null
  rotatePiece(pieceId: string): Rotation | null
  previewPlacement(pieceId: string, origin: GridCoord): PlacementPreview | null
  placePiece(pieceId: string, origin: GridCoord): boolean
  removePiece(pieceId: string): boolean
  undo(): boolean
  restart(): void
  snapshot(): PuzzleSnapshot
}

function buildInventory(level: LevelDefinition): InventoryPiece[] {
  const pieces: InventoryPiece[] = []
  let counter = 0
  for (const entry of level.inventory) {
    for (let i = 0; i < entry.count; i += 1) {
      counter += 1
      pieces.push({
        instanceId: `${level.id}-${entry.typeId}-${counter}`,
        typeId: entry.typeId,
        rotation: 0,
        origin: null,
      })
    }
  }
  return pieces
}

export type CreatePuzzleEngineOptions = {
  /** When true, records competitive replay actions for optional online verification. */
  recordActions?: boolean
}

export function createPuzzleEngine(
  level: LevelDefinition,
  options: CreatePuzzleEngineOptions = {},
): PuzzleEngine {
  let grid = createRoofGrid(level)
  let pieces = buildInventory(level)
  let selectedPieceId: string | null = null
  let moveHistory: MoveRecord[] = []
  let startedAt = Date.now()
  let actionLog: GameAction[] = []
  const recordActions = options.recordActions === true

  function findPiece(pieceId: string): InventoryPiece | undefined {
    return pieces.find((p) => p.instanceId === pieceId)
  }

  function updatePiece(pieceId: string, patch: Partial<InventoryPiece>): void {
    pieces = pieces.map((p) => (p.instanceId === pieceId ? { ...p, ...patch } : p))
  }

  function pushAction(action: GameAction): void {
    if (!recordActions) return
    actionLog = [...actionLog, action]
  }

  function nextAction<T extends Omit<GameAction, 'seq' | 'clientAtMs'>>(
    action: T,
  ): T & { seq: number; clientAtMs: number } {
    return {
      ...action,
      seq: actionLog.length,
      clientAtMs: Date.now() - startedAt,
    }
  }

  const engine: PuzzleEngine = {
    level,

    getGrid() {
      return cloneGrid(grid)
    },

    getPieces() {
      return pieces.map((p) => ({ ...p }))
    },

    getSelectedPieceId() {
      return selectedPieceId
    },

    getCoverage() {
      return coveragePercent(grid)
    },

    isComplete() {
      return isFullyCovered(grid)
    },

    canFinish() {
      return canFinishDesign(level, grid)
    },

    getStartedAt() {
      return startedAt
    },

    getActionLog() {
      return actionLog
    },

    clearActionLog() {
      actionLog = []
    },

    recordCompleteAction() {
      pushAction(nextAction({ kind: 'complete' }))
    },

    getInvalidPlacementCount() {
      return actionLog.reduce((sum, action) => (action.kind === 'invalid_place' ? sum + 1 : sum), 0)
    },

    selectPiece(pieceId) {
      if (pieceId === null) {
        selectedPieceId = null
        return
      }
      if (findPiece(pieceId)) {
        selectedPieceId = pieceId
        pushAction(nextAction({ kind: 'select', pieceId }))
      }
    },

    rotateSelected() {
      if (!selectedPieceId) return null
      return engine.rotatePiece(selectedPieceId)
    },

    rotatePiece(pieceId) {
      const piece = findPiece(pieceId)
      if (!piece) return null

      // If placed, try rotating in place; revert if invalid.
      if (piece.origin) {
        const newRotation = nextRotation(piece.rotation)
        grid = clearPieceFromGrid(grid, pieceId)
        const preview = canPlacePiece(
          level,
          grid,
          { ...piece, rotation: newRotation },
          piece.origin,
        )
        if (!preview.valid) {
          grid = applyPlacement(grid, pieceId, resolveAbsoluteCells(piece, piece.origin))
          return piece.rotation
        }
        updatePiece(pieceId, { rotation: newRotation })
        grid = applyPlacement(grid, pieceId, preview.cells)
        pushAction(nextAction({ kind: 'rotate', pieceId, rotation: newRotation }))
        return newRotation
      }

      const newRotation = nextRotation(piece.rotation)
      updatePiece(pieceId, { rotation: newRotation })
      pushAction(nextAction({ kind: 'rotate', pieceId, rotation: newRotation }))
      return newRotation
    },

    previewPlacement(pieceId, origin) {
      const piece = findPiece(pieceId)
      if (!piece) return null
      const working =
        piece.origin !== null ? clearPieceFromGrid(cloneGrid(grid), pieceId) : cloneGrid(grid)
      return canPlacePiece(level, working, piece, origin)
    },

    placePiece(pieceId, origin) {
      const piece = findPiece(pieceId)
      if (!piece) return false

      let working = cloneGrid(grid)
      if (piece.origin !== null) {
        working = clearPieceFromGrid(working, pieceId)
      }

      const preview = canPlacePiece(level, working, piece, origin)
      if (!preview.valid) {
        pushAction(
          nextAction({
            kind: 'invalid_place',
            pieceId,
            origin,
            rotation: piece.rotation,
          }),
        )
        return false
      }

      // Record remove of previous placement so undo restores tray/prior spot.
      if (piece.origin !== null) {
        moveHistory = [
          ...moveHistory,
          {
            kind: 'remove',
            pieceId,
            origin: piece.origin,
            rotation: piece.rotation,
          },
        ]
      }

      grid = applyPlacement(working, pieceId, preview.cells)
      updatePiece(pieceId, { origin })
      moveHistory = [
        ...moveHistory,
        { kind: 'place', pieceId, origin, rotation: piece.rotation },
      ]
      selectedPieceId = pieceId
      pushAction(nextAction({ kind: 'place', pieceId, origin, rotation: piece.rotation }))
      return true
    },

    removePiece(pieceId) {
      const piece = findPiece(pieceId)
      if (!piece || piece.origin === null) return false

      moveHistory = [
        ...moveHistory,
        {
          kind: 'remove',
          pieceId,
          origin: piece.origin,
          rotation: piece.rotation,
        },
      ]
      grid = clearPieceFromGrid(grid, pieceId)
      updatePiece(pieceId, { origin: null })
      pushAction(nextAction({ kind: 'remove', pieceId }))
      return true
    },

    undo() {
      if (moveHistory.length === 0) return false

      const last = moveHistory[moveHistory.length - 1]
      moveHistory = moveHistory.slice(0, -1)
      pushAction(nextAction({ kind: 'undo' }))

      if (last.kind === 'place') {
        // Undo place → remove from roof. If there was a preceding remove for
        // the same piece (reposition), restore that prior origin.
        grid = clearPieceFromGrid(grid, last.pieceId)
        const prior = moveHistory[moveHistory.length - 1]
        if (
          prior &&
          prior.kind === 'remove' &&
          prior.pieceId === last.pieceId
        ) {
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
        return true
      }

      // Undo remove → restore placement
      const piece = findPiece(last.pieceId)
      if (!piece) return false
      const cells = resolveAbsoluteCells(
        { typeId: piece.typeId, rotation: last.rotation },
        last.origin,
      )
      grid = applyPlacement(grid, last.pieceId, cells)
      updatePiece(last.pieceId, { origin: last.origin, rotation: last.rotation })
      return true
    },

    restart() {
      grid = createRoofGrid(level)
      pieces = buildInventory(level)
      selectedPieceId = null
      moveHistory = []
      startedAt = Date.now()
      actionLog = []
    },

    snapshot() {
      return {
        levelId: level.id,
        pieces: pieces.map((p) => ({ ...p })),
        selectedPieceId,
        moveHistory: [...moveHistory],
        startedAt,
      }
    },
  }

  return engine
}
