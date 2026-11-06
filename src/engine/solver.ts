import type {
  GridCoord,
  LevelDefinition,
  PieceTypeId,
  SolutionPlacement,
} from '../types/game'
import { createRoofGrid, getPlayableCells, keyOf } from './grid'
import { applyPlacement, canPlacePiece } from './placement'
import { cellCount, getRotatedCells, uniqueRotations, type Rotation } from './pieces'

export type SolveResult = Readonly<{
  solvable: boolean
  placements: readonly SolutionPlacement[]
  playableCells: number
  inventoryCells: number
}>

function expandInventory(level: LevelDefinition): PieceTypeId[] {
  const pieces: PieceTypeId[] = []
  for (const entry of level.inventory) {
    for (let i = 0; i < entry.count; i += 1) {
      pieces.push(entry.typeId)
    }
  }
  pieces.sort((a, b) => cellCount(b) - cellCount(a))
  return pieces
}

/**
 * Deterministic exact-cover backtracking solver for development tests.
 * Chooses the first empty playable cell and tries every remaining piece that can cover it.
 * Not exposed to players.
 */
export function solveLevel(level: LevelDefinition, maxNodes = 3_000_000): SolveResult {
  let grid = createRoofGrid(level)
  const playableCells = getPlayableCells(grid).length
  const inventoryCells = level.inventory.reduce(
    (sum, entry) => sum + cellCount(entry.typeId) * entry.count,
    0,
  )

  if (inventoryCells !== playableCells) {
    return { solvable: false, placements: [], playableCells, inventoryCells }
  }

  const remaining = expandInventory(level)
  const placements: SolutionPlacement[] = []
  let nodes = 0

  function firstEmpty(): GridCoord | null {
    for (const cell of getPlayableCells(grid)) {
      if (cell.state === 'empty') return { col: cell.col, row: cell.row }
    }
    return null
  }

  function search(pool: PieceTypeId[]): boolean {
    nodes += 1
    if (nodes > maxNodes) return false

    const anchor = firstEmpty()
    if (!anchor) return pool.length === 0
    if (pool.length === 0) return false

    // Deduplicate identical type attempts at this depth
    const triedTypes = new Set<PieceTypeId>()

    for (let i = 0; i < pool.length; i += 1) {
      const typeId = pool[i]!
      if (triedTypes.has(typeId)) continue
      triedTypes.add(typeId)

      const nextPool = [...pool.slice(0, i), ...pool.slice(i + 1)]

      for (const rotation of uniqueRotations(typeId)) {
        const shape = getRotatedCells(typeId, rotation)
        for (const offset of shape) {
          const origin = { col: anchor.col - offset.col, row: anchor.row - offset.row }
          const preview = canPlacePiece(
            level,
            grid,
            { typeId, rotation, instanceId: `solve-${nodes}` },
            origin,
          )
          if (!preview.valid) continue

          const coversAnchor = preview.cells.some(
            (c) => c.col === anchor.col && c.row === anchor.row,
          )
          if (!coversAnchor) continue

          const snapshot = grid
          grid = applyPlacement(grid, `solve-${nodes}`, preview.cells)
          placements.push({ typeId, origin, rotation: rotation as Rotation })
          if (search(nextPool)) return true
          placements.pop()
          grid = snapshot
        }
      }
    }
    return false
  }

  const solvable = search(remaining)
  return {
    solvable,
    placements: solvable ? [...placements] : [],
    playableCells,
    inventoryCells,
  }
}

/** Validate that blocked/outside cells never appear in a placement set. */
export function placementsRespectBoundaries(
  level: LevelDefinition,
  placements: readonly SolutionPlacement[],
): boolean {
  const blocked = new Set(level.blockedCells.map(keyOf))
  const outside = new Set(level.outsideCells.map(keyOf))

  for (const placement of placements) {
    const cells = getRotatedCells(placement.typeId, placement.rotation).map((offset) => ({
      col: placement.origin.col + offset.col,
      row: placement.origin.row + offset.row,
    }))
    for (const cell of cells) {
      const key = keyOf(cell)
      if (blocked.has(key) || outside.has(key)) return false
      if (
        cell.col < 0 ||
        cell.row < 0 ||
        cell.col >= level.columns ||
        cell.row >= level.rows
      ) {
        return false
      }
    }
  }
  return true
}
