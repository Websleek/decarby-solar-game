import type { CellState, GridCoord, LevelDefinition, RoofCell } from '../types/game'

export function createRoofGrid(level: LevelDefinition): RoofCell[][] {
  const blocked = new Set(level.blockedCells.map(keyOf))
  const outside = new Set(level.outsideCells.map(keyOf))

  const grid: RoofCell[][] = []
  for (let row = 0; row < level.rows; row += 1) {
    const rowCells: RoofCell[] = []
    for (let col = 0; col < level.columns; col += 1) {
      const key = keyOf({ col, row })
      let state: CellState = 'empty'
      if (outside.has(key)) state = 'outside'
      else if (blocked.has(key)) state = 'blocked'
      rowCells.push({ col, row, state, occupiedBy: null })
    }
    grid.push(rowCells)
  }
  return grid
}

export function keyOf(coord: GridCoord): string {
  return `${coord.col},${coord.row}`
}

export function cloneGrid(grid: readonly (readonly RoofCell[])[]): RoofCell[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })))
}

export function isInBounds(level: LevelDefinition, coord: GridCoord): boolean {
  return (
    coord.col >= 0 &&
    coord.col < level.columns &&
    coord.row >= 0 &&
    coord.row < level.rows
  )
}

export function getPlayableCells(grid: readonly (readonly RoofCell[])[]): RoofCell[] {
  return grid.flat().filter((cell) => cell.state !== 'outside' && cell.state !== 'blocked')
}

export function countOccupied(grid: readonly (readonly RoofCell[])[]): number {
  return getPlayableCells(grid).filter((cell) => cell.state === 'occupied').length
}

export function coveragePercent(grid: readonly (readonly RoofCell[])[]): number {
  const playable = getPlayableCells(grid)
  if (playable.length === 0) return 0
  const occupied = playable.filter((cell) => cell.state === 'occupied').length
  return Math.round((occupied / playable.length) * 100)
}

export function isFullyCovered(grid: readonly (readonly RoofCell[])[]): boolean {
  return getPlayableCells(grid).every((cell) => cell.state === 'occupied')
}
