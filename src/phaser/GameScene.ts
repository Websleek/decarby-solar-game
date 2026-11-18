import Phaser from 'phaser'
import type { PuzzleEngine } from '../engine/puzzleState'
import type { GridCoord, InventoryPiece, PlacementPreview } from '../types/game'
import { cellCount, getRotatedCells } from '../engine/pieces'
import { snapOrigin } from '../engine/placement'

export type GameSceneCallbacks = {
  onStateChange: () => void
  onLevelAutoComplete: () => void
  onPointsEarned?: (points: number, worldX: number, worldY: number) => void
  onInvalidPlacement?: () => void
  onValidPlacement?: () => void
}

export type GameSceneConfig = {
  engine: PuzzleEngine
  callbacks: GameSceneCallbacks
}

const BASE_CELL_SIZE = 56
const MIN_CELL_SIZE = 36

const COLORS = {
  sky: 0x7ec8e8,
  skyDeep: 0x5eb3e4,
  grass: 0x6eab3e,
  grassDark: 0x4f8f2e,
  roofDeck: 0xc9a27a,
  roofDeckAlt: 0xbf9670,
  roofDeckEmpty: 0xd4b08a,
  roofEdge: 0xa67c52,
  roofRidge: 0x8b6340,
  chimney: 0xc45c3a,
  wall: 0xf5ead2,
  pv: 0x143a66,
  pvMid: 0x1c4f86,
  pvHi: 0x2a6aa8,
  pvFrame: 0xc5d6e8,
  pvCell: 0x9ec4e8,
  valid: 0x3ecf6e,
  invalid: 0xf87171,
  selected: 0xf5c518,
  gridIdle: 0xffffff,
  gridActive: 0x2b8fc9,
}

export class GameScene extends Phaser.Scene {
  private engine!: PuzzleEngine
  private callbacks!: GameSceneCallbacks
  private cellSize = BASE_CELL_SIZE
  private offsetX = 0
  private offsetY = 0
  private envGfx!: Phaser.GameObjects.Graphics
  private roofGfx!: Phaser.GameObjects.Graphics
  private previewGfx!: Phaser.GameObjects.Graphics
  private pieceContainers = new Map<string, Phaser.GameObjects.Container>()
  private dragPieceId: string | null = null
  private tapSelectedId: string | null = null
  private pointerDownAt: { x: number; y: number } | null = null
  private isDragging = false
  private reducedMotion = false
  private hintGfx: Phaser.GameObjects.Graphics | null = null
  private hintCells: readonly GridCoord[] = []

  constructor() {
    super({ key: 'GameScene' })
  }

  init(data: GameSceneConfig): void {
    this.engine = data.engine
    this.callbacks = data.callbacks
  }

  create(): void {
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.cameras.main.setBackgroundColor('#7ec8e8')
    this.envGfx = this.add.graphics()
    this.roofGfx = this.add.graphics()
    this.previewGfx = this.add.graphics()
    this.hintGfx = this.add.graphics()

    this.layoutScene()
    this.syncPieces()
    this.drawHintHighlight()

    this.input.on('pointerdown', this.handlePointerDown, this)
    this.input.on('pointermove', this.handlePointerMove, this)
    this.input.on('pointerup', this.handlePointerUp, this)
    this.scale.on('resize', this.handleResize, this)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown, this)
      this.input.off('pointermove', this.handlePointerMove, this)
      this.input.off('pointerup', this.handlePointerUp, this)
      this.scale.off('resize', this.handleResize, this)
    })
  }

  /** Called from React when tray selection / rotate / undo / restart changes state. */
  refreshFromEngine(): void {
    this.drawRoofGrid(this.isDragging)
    this.syncPieces()
    this.previewGfx.clear()
    this.drawHintHighlight()
  }

  showHint(cells: readonly GridCoord[]): void {
    this.hintCells = cells
    this.drawHintHighlight()
  }

  clearHint(): void {
    this.hintCells = []
    this.hintGfx?.clear()
  }

  private drawHintHighlight(): void {
    if (!this.hintGfx) return
    this.hintGfx.clear()
    if (this.hintCells.length === 0) return
    this.hintGfx.lineStyle(3, COLORS.selected, 0.95)
    this.hintGfx.fillStyle(COLORS.selected, 0.22)
    for (const cell of this.hintCells) {
      if (
        cell.col < 0 ||
        cell.row < 0 ||
        cell.col >= this.engine.level.columns ||
        cell.row >= this.engine.level.rows
      ) {
        continue
      }
      const x = this.offsetX + cell.col * this.cellSize + 2
      const y = this.offsetY + cell.row * this.cellSize + 2
      const s = this.cellSize - 4
      this.hintGfx.fillRoundedRect(x, y, s, s, 5)
      this.hintGfx.strokeRoundedRect(x, y, s, s, 5)
    }
  }

  private handleResize = (): void => {
    this.layoutScene()
    this.syncPieces()
  }

  private layoutScene(): void {
    const level = this.engine.level
    const width = this.scale.width
    const height = this.scale.height

    // Fit the full logical grid into the canvas with room for eaves/environment.
    const padX = 56
    const padY = 72
    const maxCellW = Math.floor((width - padX) / level.columns)
    const maxCellH = Math.floor((height - padY) / level.rows)
    this.cellSize = Math.max(MIN_CELL_SIZE, Math.min(BASE_CELL_SIZE, maxCellW, maxCellH))

    const gridW = level.columns * this.cellSize
    const gridH = level.rows * this.cellSize
    this.offsetX = Math.max(24, (width - gridW) / 2)
    this.offsetY = Math.max(36, (height - gridH) / 2 + 6)

    this.drawEnvironment(gridW, gridH)
    this.drawRoofGrid(false)
  }

  private theme() {
    return this.engine.level.visualTheme
  }

  private drawEnvironment(gridW: number, gridH: number): void {
    const g = this.envGfx
    g.clear()

    const width = this.scale.width
    const height = this.scale.height
    const theme = this.theme()
    const preset = theme.sceneryPreset ?? 'garden'
    const roofLeft = this.offsetX
    const roofTop = this.offsetY
    const roofRight = roofLeft + gridW
    const roofBottom = roofTop + gridH
    const yardPad = Math.max(56, Math.min(width, height) * 0.12)

    g.fillStyle(theme.sky, 1)
    g.fillRect(0, 0, width, height)
    this.cameras.main.setBackgroundColor(theme.sky)
    g.fillStyle(theme.skyDeep, 0.14)
    g.fillRect(0, 0, width, height * 0.2)

    g.fillStyle(theme.grass, 1)
    g.fillRoundedRect(
      Math.max(8, roofLeft - yardPad),
      Math.max(8, roofTop - yardPad * 0.7),
      Math.min(width - 16, gridW + yardPad * 2),
      Math.min(height - 16, gridH + yardPad * 1.55),
      18,
    )

    const shrub = (x: number, y: number, w: number, h: number) => {
      g.fillStyle(0x3f7d2c, 1)
      g.fillEllipse(x, y, w, h)
      g.fillStyle(0x5ea038, 1)
      g.fillEllipse(x - w * 0.15, y - 2, w * 0.55, h * 0.7)
    }

    if (preset === 'garden') {
      // Walking path
      g.fillStyle(0xcbb89a, 1)
      g.fillRoundedRect(width / 2 - 14, roofBottom + 8, 28, yardPad * 0.7, 8)
      g.fillStyle(0xb89f7d, 0.45)
      for (let i = 0; i < 5; i += 1) {
        g.fillRect(width / 2 - 10, roofBottom + 14 + i * 10, 20, 3)
      }
      shrub(roofLeft - 26, roofTop + 20, 28, 16)
      shrub(roofRight + 24, roofTop + 28, 26, 15)
      shrub(roofLeft - 20, roofBottom - 8, 24, 14)
      g.fillStyle(0xed3363, 0.9)
      g.fillCircle(roofLeft - 16, roofBottom + 10, 3)
      g.fillStyle(0xf5c518, 0.9)
      g.fillCircle(roofRight + 14, roofBottom + 12, 3)
    } else if (preset === 'driveway') {
      const driveX = Math.max(10, roofLeft - yardPad + 8)
      const driveY = roofTop + gridH * 0.12
      g.fillStyle(0x8f97a1, 1)
      g.fillRoundedRect(driveX, driveY, 44, gridH * 0.78, 6)
      g.fillStyle(0xffffff, 0.3)
      for (let i = 0; i < 5; i += 1) {
        g.fillRect(driveX + 19, driveY + 12 + i * 20, 6, 9)
      }
      const carX = driveX + 8
      const carY = driveY + gridH * 0.3
      g.fillStyle(0x2f4f7a, 1)
      g.fillRoundedRect(carX, carY, 28, 52, 8)
      g.fillStyle(0x9ec8ef, 0.85)
      g.fillRoundedRect(carX + 4, carY + 10, 20, 14, 3)
      g.fillRoundedRect(carX + 4, carY + 30, 20, 10, 3)
      g.fillStyle(0x1a1a1a, 0.75)
      g.fillCircle(carX + 5, carY + 8, 3)
      g.fillCircle(carX + 23, carY + 8, 3)
      g.fillCircle(carX + 5, carY + 44, 3)
      g.fillCircle(carX + 23, carY + 44, 3)
      shrub(roofRight + 22, roofTop + 22, 26, 15)
      shrub(roofRight + 18, roofBottom - 10, 22, 13)
    } else {
      // patio + fence
      const patioX = Math.min(width - 58, roofRight + 10)
      const patioY = roofTop + gridH * 0.28
      g.fillStyle(0xd2b48c, 1)
      g.fillRoundedRect(patioX, patioY, 46, 64, 6)
      g.fillStyle(0xb8956a, 0.55)
      g.fillRect(patioX + 4, patioY + 12, 38, 2)
      g.fillRect(patioX + 4, patioY + 32, 38, 2)
      g.fillRect(patioX + 4, patioY + 52, 38, 2)
      g.fillStyle(0x8b6914, 1)
      g.fillCircle(patioX + 23, patioY + 30, 8)
      g.fillStyle(0xc4a35a, 1)
      g.fillCircle(patioX + 23, patioY + 30, 5)
      const fenceY = Math.min(height - 18, roofBottom + yardPad * 0.85)
      g.fillStyle(0x8d6e4c, 1)
      const fenceLeft = Math.max(16, roofLeft - yardPad + 6)
      const fenceRight = Math.min(width - 16, roofRight + yardPad - 6)
      g.fillRect(fenceLeft, fenceY, fenceRight - fenceLeft, 3)
      for (let x = fenceLeft; x <= fenceRight; x += 18) {
        g.fillRect(x, fenceY - 10, 3, 14)
      }
      shrub(roofLeft - 24, roofTop + 18, 26, 15)
      shrub(roofLeft - 18, roofBottom - 6, 22, 13)
    }

    // Roof plate with gutter / fascia — playable area stays clear
    const pad = 14
    g.fillStyle(0x000000, 0.18)
    g.fillRoundedRect(roofLeft - pad + 5, roofTop - pad + 8, gridW + pad * 2, gridH + pad * 2, 10)
    g.fillStyle(theme.roofEdge, 1)
    g.fillRoundedRect(roofLeft - pad, roofTop - pad, gridW + pad * 2, gridH + pad * 2, 10)
    g.fillStyle(theme.roofDeck, 1)
    g.fillRoundedRect(
      roofLeft - pad + 3,
      roofTop - pad + 3,
      gridW + pad * 2 - 6,
      gridH + pad * 2 - 6,
      8,
    )
    g.lineStyle(3, theme.roofEdge, 0.95)
    g.strokeRoundedRect(
      roofLeft - pad + 1,
      roofTop - pad + 1,
      gridW + pad * 2 - 2,
      gridH + pad * 2 - 2,
      8,
    )
    // Ridge cap suggestion across top of plate
    g.fillStyle(0xffffff, 0.18)
    g.fillRoundedRect(roofLeft - pad + 8, roofTop - pad + 4, gridW + pad * 2 - 16, 5, 2)
  }

  /** Overlapping tile courses — cheap graphics, no per-frame textures. */
  private drawRoofTileCell(x: number, y: number, col: number, row: number): void {
    const g = this.roofGfx
    const s = this.cellSize
    const theme = this.theme()
    const base = (col + row) % 2 === 0 ? theme.roofDeck : theme.roofDeckAlt
    const shade = theme.roofEdge
    g.fillStyle(base, 1)
    g.fillRect(x + 1, y + 1, s - 2, s - 2)

    // Staggered overlapping courses
    const courseH = Math.max(4, Math.floor(s / 3.2))
    const stagger = row % 2 === 0 ? 0 : s * 0.22
    for (let i = 0; i < 3; i += 1) {
      const yy = y + 3 + i * courseH
      g.fillStyle(shade, 0.22)
      g.fillRect(x + 2 + stagger * 0.15, yy + courseH - 2, s - 4, 2)
      g.lineStyle(1, 0xffffff, 0.12)
      g.lineBetween(x + 3 + stagger, yy + 1, x + s - 3, yy + 1)
      // Vertical seams suggesting individual tiles
      const seam = s / 3
      g.lineStyle(1, shade, 0.28)
      g.lineBetween(x + seam + stagger * 0.2, yy, x + seam + stagger * 0.2, yy + courseH - 1)
      g.lineBetween(x + seam * 2 - stagger * 0.1, yy, x + seam * 2 - stagger * 0.1, yy + courseH - 1)
    }
    // Soft shadow at bottom edge of cell
    g.fillStyle(0x000000, 0.1)
    g.fillRect(x + 1, y + s - 4, s - 2, 3)
  }

  private obstacleKindAt(col: number, row: number): string | null {
    for (const obstacle of this.engine.level.obstacles) {
      if (obstacle.cells.some((c) => c.col === col && c.row === row)) {
        return obstacle.kind
      }
    }
    return null
  }

  private drawObstacle(x: number, y: number, kind: string | null): void {
    const s = this.cellSize
    const g = this.roofGfx
    if (kind === 'skylight') {
      g.fillStyle(0x7ec8e8, 1)
      g.fillRoundedRect(x + 4, y + 4, s - 8, s - 8, 4)
      g.lineStyle(2, 0xffffff, 0.7)
      g.strokeRoundedRect(x + 4, y + 4, s - 8, s - 8, 4)
      g.lineStyle(1, 0x16384a, 0.25)
      g.lineBetween(x + s / 2, y + 6, x + s / 2, y + s - 6)
      g.lineBetween(x + 6, y + s / 2, x + s - 6, y + s / 2)
      return
    }
    if (kind === 'vent' || kind === 'acUnit') {
      g.fillStyle(0x6b7280, 1)
      g.fillRoundedRect(x + 3, y + 3, s - 6, s - 6, 4)
      g.lineStyle(1, 0xd1d5db, 0.8)
      for (let i = 1; i < 4; i += 1) {
        const yy = y + 6 + i * ((s - 12) / 4)
        g.lineBetween(x + 8, yy, x + s - 8, yy)
      }
      return
    }
    // chimney / default
    g.fillStyle(0xc45c3a, 1)
    g.fillRoundedRect(x + 3, y + 3, s - 6, s - 6, 4)
    g.fillStyle(0xa94422, 1)
    g.fillRect(x + 6, y + 5, s - 12, 6)
    g.fillStyle(0x7f2f18, 1)
    g.fillRect(x + s / 2 - 3, y + 12, 6, s - 20)
  }

  private drawRoofGrid(activeGuidance: boolean): void {
    this.roofGfx.clear()
    const grid = this.engine.getGrid()
    const level = this.engine.level
    const theme = this.theme()

    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.columns; col += 1) {
        const cell = grid[row]![col]!
        const x = this.offsetX + col * this.cellSize
        const y = this.offsetY + row * this.cellSize

        if (cell.state === 'outside') continue

        if (cell.state === 'blocked') {
          this.roofGfx.fillStyle(theme.roofEdge, 0.55)
          this.roofGfx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2)
          this.drawObstacle(x, y, this.obstacleKindAt(col, row))
        } else if (cell.state === 'occupied') {
          this.drawRoofTileCell(x, y, col, row)
          this.roofGfx.fillStyle(theme.roofEdge, 0.12)
          this.roofGfx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2)
        } else {
          this.drawRoofTileCell(x, y, col, row)
        }

        const lineAlpha = activeGuidance ? 0.55 : 0.18
        const lineColor = activeGuidance ? COLORS.gridActive : COLORS.gridIdle
        this.roofGfx.lineStyle(1, lineColor, lineAlpha)
        this.roofGfx.strokeRect(x + 0.5, y + 0.5, this.cellSize - 1, this.cellSize - 1)
      }
    }

    this.drawRoofRidges(grid, level)
  }

  /** Ridge caps along pitched section joins (incl. L-roof junctions). */
  private drawRoofRidges(
    grid: ReturnType<PuzzleEngine['getGrid']>,
    level: PuzzleEngine['level'],
  ): void {
    const g = this.roofGfx
    const theme = this.theme()
    const s = this.cellSize
    const playable = (col: number, row: number) => {
      if (row < 0 || col < 0 || row >= level.rows || col >= level.columns) return false
      const cell = grid[row]![col]
      return cell != null && cell.state !== 'outside'
    }

    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.columns; col += 1) {
        if (!playable(col, row)) continue
        const x = this.offsetX + col * s
        const y = this.offsetY + row * s
        // Horizontal ridge when neighbour above is outside / missing
        if (!playable(col, row - 1)) {
          g.fillStyle(0xffffff, 0.35)
          g.fillRect(x + 2, y + 1, s - 4, 3)
          g.fillStyle(theme.roofEdge, 0.55)
          g.fillRect(x + 2, y + 3, s - 4, 2)
        }
        // Vertical ridge / valley when neighbour left is outside (L junctions)
        if (!playable(col - 1, row)) {
          g.fillStyle(0xffffff, 0.28)
          g.fillRect(x + 1, y + 2, 3, s - 4)
          g.fillStyle(theme.roofEdge, 0.5)
          g.fillRect(x + 3, y + 2, 2, s - 4)
        }
      }
    }
  }

  private syncPieces(): void {
    const pieces = this.engine.getPieces()
    const liveIds = new Set(pieces.map((p) => p.instanceId))

    for (const [id, container] of this.pieceContainers) {
      if (!liveIds.has(id)) {
        container.destroy()
        this.pieceContainers.delete(id)
      }
    }

    for (const piece of pieces) {
      if (piece.origin === null) {
        const existing = this.pieceContainers.get(piece.instanceId)
        if (existing) {
          existing.destroy()
          this.pieceContainers.delete(piece.instanceId)
        }
        continue
      }
      this.upsertPieceVisual(piece)
    }
  }

  private drawPvModule(
    g: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    selected: boolean,
  ): void {
    const inset = 3
    const w = this.cellSize - inset * 2
    const h = this.cellSize - inset * 2
    const x = px + inset
    const y = py + inset

    // Soft drop shadow
    g.fillStyle(0x000000, 0.16)
    g.fillRoundedRect(x + 1, y + 2, w, h, 5)

    // Frame
    g.fillStyle(COLORS.pvFrame, 1)
    g.fillRoundedRect(x, y, w, h, 5)

    // Navy PV surface
    g.fillStyle(COLORS.pv, 1)
    g.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 3)

    // Subtle diagonal highlight band
    g.fillStyle(COLORS.pvHi, 0.22)
    g.fillTriangle(x + 2, y + 2, x + w * 0.55, y + 2, x + 2, y + h * 0.55)

    // Photovoltaic cell grid
    g.lineStyle(1, COLORS.pvCell, 0.32)
    const cols = 3
    const rows = 3
    const innerX = x + 4
    const innerY = y + 4
    const innerW = w - 8
    const innerH = h - 8
    for (let c = 1; c < cols; c += 1) {
      const lx = innerX + (innerW * c) / cols
      g.lineBetween(lx, innerY, lx, innerY + innerH)
    }
    for (let r = 1; r < rows; r += 1) {
      const ly = innerY + (innerH * r) / rows
      g.lineBetween(innerX, ly, innerX + innerW, ly)
    }

    // Specular glint
    g.lineStyle(1.5, 0xffffff, 0.28)
    g.lineBetween(x + 6, y + 7, x + 16, y + 6)

    // Selection accent
    if (selected) {
      g.lineStyle(2.5, COLORS.selected, 1)
      g.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, 6)
    } else {
      g.lineStyle(1, 0x8fa8c2, 0.7)
      g.strokeRoundedRect(x, y, w, h, 5)
    }
  }

  private upsertPieceVisual(piece: InventoryPiece): void {
    const existing = this.pieceContainers.get(piece.instanceId)
    if (existing) {
      existing.destroy()
    }

    const container = this.add.container(0, 0)
    const cells = getRotatedCells(piece.typeId, piece.rotation)
    const selected =
      piece.instanceId === this.engine.getSelectedPieceId() ||
      piece.instanceId === this.tapSelectedId

    for (const cell of cells) {
      const panel = this.add.graphics()
      this.drawPvModule(panel, cell.col * this.cellSize, cell.row * this.cellSize, selected)
      container.add(panel)
    }

    const origin = piece.origin!
    container.setPosition(
      this.offsetX + origin.col * this.cellSize,
      this.offsetY + origin.row * this.cellSize,
    )
    container.setData('pieceId', piece.instanceId)
    container.setInteractive(
      new Phaser.Geom.Rectangle(
        0,
        0,
        (Math.max(...cells.map((c) => c.col)) + 1) * this.cellSize,
        (Math.max(...cells.map((c) => c.row)) + 1) * this.cellSize,
      ),
      Phaser.Geom.Rectangle.Contains,
    )

    this.pieceContainers.set(piece.instanceId, container)
  }

  private worldToGrid(x: number, y: number): GridCoord {
    return snapOrigin((x - this.offsetX) / this.cellSize, (y - this.offsetY) / this.cellSize)
  }

  private findPieceAtPointer(x: number, y: number): string | null {
    const gridPos = this.worldToGrid(x, y)
    const cell = this.engine.getGrid()[gridPos.row]?.[gridPos.col]
    return cell?.occupiedBy ?? null
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    this.pointerDownAt = { x: pointer.x, y: pointer.y }
    this.isDragging = false

    const hitId = this.findPieceAtPointer(pointer.x, pointer.y)
    if (hitId) {
      this.dragPieceId = hitId
      this.engine.selectPiece(hitId)
      this.callbacks.onStateChange()
      return
    }

    const selected = this.engine.getSelectedPieceId()
    if (selected) {
      const piece = this.engine.getPieces().find((p) => p.instanceId === selected)
      if (piece && piece.origin === null) {
        this.dragPieceId = selected
      }
    }
  }

  private handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragPieceId || !this.pointerDownAt) return

    const dx = pointer.x - this.pointerDownAt.x
    const dy = pointer.y - this.pointerDownAt.y
    if (!this.isDragging && dx * dx + dy * dy > 36) {
      this.isDragging = true
      this.drawRoofGrid(true)
    }
    if (!this.isDragging) return

    const piece = this.engine.getPieces().find((p) => p.instanceId === this.dragPieceId)
    if (!piece) return

    const origin = this.worldToGrid(pointer.x - this.cellSize / 2, pointer.y - this.cellSize / 2)
    const preview = this.engine.previewPlacement(this.dragPieceId, origin)
    this.drawPreview(preview)
  }

  private handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragPieceId) {
      this.pointerDownAt = null
      return
    }

    const pieceId = this.dragPieceId
    const piece = this.engine.getPieces().find((p) => p.instanceId === pieceId)
    const wasDragging = this.isDragging
    this.dragPieceId = null
    this.previewGfx.clear()
    this.isDragging = false

    if (!piece) {
      this.pointerDownAt = null
      this.drawRoofGrid(false)
      return
    }

    const origin = this.worldToGrid(pointer.x - this.cellSize / 2, pointer.y - this.cellSize / 2)

    if (wasDragging || piece.origin === null) {
      const placed = this.engine.placePiece(pieceId, origin)
      if (placed) {
        this.clearHint()
        this.playPlaceFeedback(origin, piece)
        const points = cellCount(piece.typeId) * this.engine.level.scoring.pointsPerCell
        const cx =
          this.offsetX +
          (origin.col + getRotatedCells(piece.typeId, piece.rotation).reduce((m, c) => Math.max(m, c.col), 0) / 2) *
            this.cellSize +
          this.cellSize / 2
        const cy = this.offsetY + origin.row * this.cellSize
        this.callbacks.onPointsEarned?.(points, cx, cy)
        this.callbacks.onValidPlacement?.()
        this.callbacks.onStateChange()
        if (this.engine.isComplete()) {
          this.playCompletionFlash()
          this.callbacks.onLevelAutoComplete()
        }
      } else {
        this.flashInvalid(origin, piece)
        this.callbacks.onInvalidPlacement?.()
        this.callbacks.onStateChange()
      }
    } else {
      this.tapSelectedId = pieceId
      this.engine.selectPiece(pieceId)
      this.callbacks.onStateChange()
    }

    this.pointerDownAt = null
    this.refreshFromEngine()
  }

  private drawPreview(preview: PlacementPreview | null): void {
    this.previewGfx.clear()
    if (!preview) return
    const color = preview.valid ? COLORS.valid : COLORS.invalid
    this.previewGfx.fillStyle(color, 0.4)
    this.previewGfx.lineStyle(2, color, 0.85)
    for (const cell of preview.cells) {
      if (
        cell.col < 0 ||
        cell.row < 0 ||
        cell.col >= this.engine.level.columns ||
        cell.row >= this.engine.level.rows
      ) {
        continue
      }
      const x = this.offsetX + cell.col * this.cellSize + 3
      const y = this.offsetY + cell.row * this.cellSize + 3
      const s = this.cellSize - 6
      this.previewGfx.fillRoundedRect(x, y, s, s, 5)
      this.previewGfx.strokeRoundedRect(x, y, s, s, 5)
    }
  }

  private playPlaceFeedback(origin: GridCoord, piece: InventoryPiece): void {
    const cells = getRotatedCells(piece.typeId, piece.rotation)
    const flash = this.add.graphics()
    flash.fillStyle(COLORS.valid, 0.5)
    for (const cell of cells) {
      flash.fillRoundedRect(
        this.offsetX + (origin.col + cell.col) * this.cellSize + 3,
        this.offsetY + (origin.row + cell.row) * this.cellSize + 3,
        this.cellSize - 6,
        this.cellSize - 6,
        5,
      )
    }

    const container = this.pieceContainers.get(piece.instanceId)
    if (container && !this.reducedMotion) {
      container.setScale(0.92)
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: 'Back.easeOut',
      })
    }

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: this.reducedMotion ? 80 : 260,
      onComplete: () => flash.destroy(),
    })
  }

  private flashInvalid(origin: GridCoord, piece: InventoryPiece): void {
    const cells = getRotatedCells(piece.typeId, piece.rotation)
    const flash = this.add.graphics()
    flash.fillStyle(COLORS.invalid, 0.45)
    flash.lineStyle(2, COLORS.invalid, 0.9)
    for (const cell of cells) {
      const col = origin.col + cell.col
      const row = origin.row + cell.row
      if (col < 0 || row < 0 || col >= this.engine.level.columns || row >= this.engine.level.rows) {
        continue
      }
      const x = this.offsetX + col * this.cellSize + 3
      const y = this.offsetY + row * this.cellSize + 3
      flash.fillRoundedRect(x, y, this.cellSize - 6, this.cellSize - 6, 5)
      flash.strokeRoundedRect(x, y, this.cellSize - 6, this.cellSize - 6, 5)
    }
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: this.reducedMotion ? 100 : 320,
      onComplete: () => flash.destroy(),
    })
    if (!this.reducedMotion) {
      this.cameras.main.shake(70, 0.003)
    }
  }

  private playCompletionFlash(): void {
    const glow = this.add.graphics()
    const gridW = this.engine.level.columns * this.cellSize
    const gridH = this.engine.level.rows * this.cellSize
    glow.fillStyle(0xffe066, 0.0)
    glow.fillRect(this.offsetX, this.offsetY, gridW, gridH)
    this.tweens.add({
      targets: glow,
      alpha: { from: 0, to: 1 },
      duration: this.reducedMotion ? 120 : 450,
      yoyo: true,
      onStart: () => {
        glow.clear()
        glow.fillStyle(0xffe066, 0.32)
        glow.fillRoundedRect(this.offsetX - 4, this.offsetY - 4, gridW + 8, gridH + 8, 8)
      },
      onComplete: () => glow.destroy(),
    })
  }
}
