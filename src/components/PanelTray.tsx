import { getRotatedCells, PIECE_DEFINITIONS } from '../engine/pieces'
import type { InventoryPiece } from '../types/game'

type PanelTrayProps = {
  pieces: readonly InventoryPiece[]
  selectedPieceId: string | null
  hintPieceId?: string | null
  onSelect: (pieceId: string) => void
}

export function PanelTray({ pieces, selectedPieceId, hintPieceId = null, onSelect }: PanelTrayProps) {
  const available = pieces.filter((p) => p.origin === null)
  const placedCount = pieces.length - available.length

  return (
    <div className="panel-tray">
      <div className="panel-tray-header">
        <h2>Solar Panels</h2>
        <span className="panel-tray-meta">
          {available.length} left · {placedCount} placed
        </span>
      </div>
      <div className="tray-scroll" role="list">
        {pieces.map((piece) => {
          const cells = getRotatedCells(piece.typeId, piece.rotation)
          const maxCol = Math.max(...cells.map((c) => c.col))
          const maxRow = Math.max(...cells.map((c) => c.row))
          const placed = piece.origin !== null
          const cellSize = 20
          return (
            <button
              key={piece.instanceId}
              type="button"
              role="listitem"
              className={`tray-piece ${selectedPieceId === piece.instanceId ? 'selected' : ''} ${hintPieceId === piece.instanceId ? 'hinted' : ''} ${placed ? 'placed' : ''}`}
              disabled={placed}
              aria-label={`${PIECE_DEFINITIONS[piece.typeId].label}${placed ? ' (placed)' : ''}`}
              aria-pressed={selectedPieceId === piece.instanceId}
              onClick={() => onSelect(piece.instanceId)}
            >
              <div
                className="mini-grid"
                style={{
                  gridTemplateColumns: `repeat(${maxCol + 1}, ${cellSize}px)`,
                  gridTemplateRows: `repeat(${maxRow + 1}, ${cellSize}px)`,
                }}
              >
                {Array.from({ length: (maxCol + 1) * (maxRow + 1) }, (_, i) => {
                  const col = i % (maxCol + 1)
                  const row = Math.floor(i / (maxCol + 1))
                  const on = cells.some((c) => c.col === col && c.row === row)
                  return on ? <div key={i} className="mini-cell" /> : <div key={i} />
                })}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
