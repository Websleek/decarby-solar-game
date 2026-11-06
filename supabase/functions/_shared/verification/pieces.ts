import type { CellOffset, PieceTypeId, Rotation } from './types.ts'

const PIECE_CELLS: Readonly<Record<PieceTypeId, readonly CellOffset[]>> = {
  single: [{ col: 0, row: 0 }],
  double: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
  ],
  triple: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
  ],
  square: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ],
  ell: [
    { col: 0, row: 0 },
    { col: 0, row: 1 },
    { col: 0, row: 2 },
    { col: 1, row: 2 },
  ],
}

function cleanZero(n: number): number {
  return Object.is(n, -0) ? 0 : n
}

function rotateOffset(cell: CellOffset, rotation: Rotation): CellOffset {
  const turns = ((rotation / 90) % 4 + 4) % 4
  let { col, row } = cell
  for (let i = 0; i < turns; i += 1) {
    const next = { col: -row, row: col }
    col = next.col
    row = next.row
  }
  return { col: cleanZero(col), row: cleanZero(row) }
}

function normalizeCells(cells: readonly CellOffset[]): CellOffset[] {
  if (cells.length === 0) return []
  const minCol = Math.min(...cells.map((c) => c.col))
  const minRow = Math.min(...cells.map((c) => c.row))
  return cells
    .map((c) => ({ col: cleanZero(c.col - minCol), row: cleanZero(c.row - minRow) }))
    .sort((a, b) => a.row - b.row || a.col - b.col)
}

export function getRotatedCells(typeId: PieceTypeId, rotation: Rotation): CellOffset[] {
  const rotated = PIECE_CELLS[typeId].map((cell) => rotateOffset(cell, rotation))
  return normalizeCells(rotated)
}

export function isValidRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270
}
