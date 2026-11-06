import type { LevelDefinition, PieceTypeId, SolutionPlacement } from '../types/game'
import { createRoofGrid, getPlayableCells } from './grid'
import { canPlacePiece } from './placement'
import { getRotatedCells, uniqueRotations } from './pieces'
import { solveLevel } from './solver'

export type DifficultyAnalysis = Readonly<{
  playableCells: number
  inventoryCells: number
  pieceTypeCount: number
  distinctPieceTypes: number
  initialPlacementOptions: number
  solvable: boolean
  solution: readonly SolutionPlacement[]
  requiredRotations: number
  solverNodesApprox: number
  nonSquarePieces: number
}>

/** Count distinct valid (type, rotation, origin) placements on an empty board. */
export function countInitialPlacements(level: LevelDefinition): number {
  const grid = createRoofGrid(level)
  const types = new Set(level.inventory.map((entry) => entry.typeId))
  let count = 0

  for (const typeId of types) {
    for (const rotation of uniqueRotations(typeId)) {
      for (let row = 0; row < level.rows; row += 1) {
        for (let col = 0; col < level.columns; col += 1) {
          const preview = canPlacePiece(
            level,
            grid,
            { typeId, rotation, instanceId: 'probe' },
            { col, row },
          )
          if (preview.valid) count += 1
        }
      }
    }
  }
  return count
}

function countRequiredRotations(solution: readonly SolutionPlacement[]): number {
  return solution.filter((step) => step.rotation !== 0).length
}

function countNonSquare(inventory: LevelDefinition['inventory']): number {
  return inventory
    .filter((entry) => entry.typeId !== 'square')
    .reduce((sum, entry) => sum + entry.count, 0)
}

/**
 * Development-only difficulty indicators. Not a substitute for human playtesting.
 */
export function analyzeLevelDifficulty(level: LevelDefinition): DifficultyAnalysis {
  const grid = createRoofGrid(level)
  const playableCells = getPlayableCells(grid).length
  const inventoryCells = level.inventory.reduce((sum, entry) => {
    const size = getRotatedCells(entry.typeId as PieceTypeId, 0).length
    return sum + size * entry.count
  }, 0)

  const started = Date.now()
  const solved = solveLevel(level)
  const solverNodesApprox = Date.now() - started

  return {
    playableCells,
    inventoryCells,
    pieceTypeCount: level.inventory.reduce((sum, entry) => sum + entry.count, 0),
    distinctPieceTypes: new Set(level.inventory.map((entry) => entry.typeId)).size,
    initialPlacementOptions: countInitialPlacements(level),
    solvable: solved.solvable,
    solution: solved.placements,
    requiredRotations: countRequiredRotations(solved.placements),
    solverNodesApprox,
    nonSquarePieces: countNonSquare(level.inventory),
  }
}
