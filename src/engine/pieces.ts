import type { CellOffset, PieceDefinition, PieceTypeId } from '../types/game'

export const PIECE_DEFINITIONS: Readonly<Record<PieceTypeId, PieceDefinition>> = {
  single: {
    id: 'single',
    label: 'Single Panel',
    cells: [{ col: 0, row: 0 }],
  },
  double: {
    id: 'double',
    label: 'Double Panel',
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
  },
  triple: {
    id: 'triple',
    label: 'Triple Panel',
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ],
  },
  square: {
    id: 'square',
    label: 'Square Group',
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ],
  },
  ell: {
    id: 'ell',
    label: 'L Group',
    cells: [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: 2 },
      { col: 1, row: 2 },
    ],
  },
}

export type Rotation = 0 | 90 | 180 | 270

function cleanZero(n: number): number {
  return Object.is(n, -0) ? 0 : n
}

/** Rotate a cell offset 90° clockwise around the piece origin. */
export function rotateOffset(cell: CellOffset, rotation: Rotation): CellOffset {
  const turns = ((rotation / 90) % 4 + 4) % 4
  let { col, row } = cell
  for (let i = 0; i < turns; i += 1) {
    const next = { col: -row, row: col }
    col = next.col
    row = next.row
  }
  return { col: cleanZero(col), row: cleanZero(row) }
}

/** Normalize rotated cells so the bounding box starts at (0,0), sorted stably. */
export function normalizeCells(cells: readonly CellOffset[]): CellOffset[] {
  if (cells.length === 0) return []
  const minCol = Math.min(...cells.map((c) => c.col))
  const minRow = Math.min(...cells.map((c) => c.row))
  return cells
    .map((c) => ({ col: cleanZero(c.col - minCol), row: cleanZero(c.row - minRow) }))
    .sort((a, b) => a.row - b.row || a.col - b.col)
}

export function getRotatedCells(typeId: PieceTypeId, rotation: Rotation): CellOffset[] {
  const definition = PIECE_DEFINITIONS[typeId]
  const rotated = definition.cells.map((cell) => rotateOffset(cell, rotation))
  return normalizeCells(rotated)
}

export function nextRotation(current: Rotation): Rotation {
  return ((current + 90) % 360) as Rotation
}

export function cellCount(typeId: PieceTypeId): number {
  return PIECE_DEFINITIONS[typeId].cells.length
}

export function inventoryCellTotal(
  inventory: readonly { typeId: PieceTypeId; count: number }[],
): number {
  return inventory.reduce((sum, entry) => sum + cellCount(entry.typeId) * entry.count, 0)
}

/** Distinct rotations that produce unique shapes for a piece type. */
export function uniqueRotations(typeId: PieceTypeId): Rotation[] {
  const seen = new Set<string>()
  const result: Rotation[] = []
  for (const rotation of [0, 90, 180, 270] as const) {
    const key = getRotatedCells(typeId, rotation)
      .map((c) => `${c.col},${c.row}`)
      .join('|')
    if (!seen.has(key)) {
      seen.add(key)
      result.push(rotation)
    }
  }
  return result
}
