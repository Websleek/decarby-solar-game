import { getRotatedCells } from './pieces.ts'
import { isInBounds } from './grid.ts'
import type { GridCoord, InventoryPiece, RoofCell, VerifiableLevel } from './types.ts'

export function resolveAbsoluteCells(
  piece: Pick<InventoryPiece, 'typeId' | 'rotation'>,
  origin: GridCoord,
): GridCoord[] {
  return getRotatedCells(piece.typeId, piece.rotation).map((offset) => ({
    col: origin.col + offset.col,
    row: origin.row + offset.row,
  }))
}

export function canPlacePiece(
  level: VerifiableLevel,
  grid: readonly (readonly RoofCell[])[],
  piece: Pick<InventoryPiece, 'typeId' | 'rotation' | 'instanceId'>,
  origin: GridCoord,
): { valid: boolean; cells: GridCoord[] } {
  const cells = resolveAbsoluteCells(piece, origin)
  let valid = true
  for (const cell of cells) {
    if (!isInBounds(level, cell)) {
      valid = false
      continue
    }
    const roofCell = grid[cell.row]?.[cell.col]
    if (!roofCell || roofCell.state === 'outside' || roofCell.state === 'blocked') {
      valid = false
      continue
    }
    if (roofCell.state === 'occupied' && roofCell.occupiedBy !== piece.instanceId) {
      valid = false
    }
  }
  return { valid, cells }
}

export function applyPlacement(
  grid: RoofCell[][],
  pieceId: string,
  cells: readonly GridCoord[],
): RoofCell[][] {
  const next = grid.map((row) => row.map((cell) => ({ ...cell })))
  for (const cell of cells) {
    const target = next[cell.row]?.[cell.col]
    if (!target) continue
    target.state = 'occupied'
    target.occupiedBy = pieceId
  }
  return next
}

export function clearPieceFromGrid(grid: RoofCell[][], pieceId: string): RoofCell[][] {
  return grid.map((row) =>
    row.map((cell) =>
      cell.occupiedBy === pieceId
        ? { ...cell, state: 'empty' as const, occupiedBy: null }
        : { ...cell },
    ),
  )
}
