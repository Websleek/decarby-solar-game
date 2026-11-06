import type { InventoryPiece, PieceTypeId, VerifiableLevel } from './types.ts'

/** Stable piece IDs — must match the browser puzzle engine. */
export function buildInventoryPieces(level: VerifiableLevel): InventoryPiece[] {
  const pieces: InventoryPiece[] = []
  let counter = 0
  for (const entry of level.inventory) {
    for (let i = 0; i < entry.count; i += 1) {
      counter += 1
      pieces.push({
        instanceId: `${level.id}-${entry.typeId}-${counter}`,
        typeId: entry.typeId as PieceTypeId,
        rotation: 0,
        origin: null,
      })
    }
  }
  return pieces
}

export function buildInventoryPieceIds(level: VerifiableLevel): string[] {
  return buildInventoryPieces(level).map((p) => p.instanceId)
}
