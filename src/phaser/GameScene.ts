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
  cloud: 0xffffff,
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

    // Sky wash
    g.fillStyle(theme.sky, 1)
    g.fillRect(0, 0, width, height)
    this.cameras.main.setBackgroundColor(theme.sky)
    g.fillStyle(theme.skyDeep, 0.18)
    g.fillRect(0, 0, width, height * 0.35)

    // Soft sun
    g.fillStyle(0xffe066, 0.28)
    g.fillCircle(width - 48, 36, 42)
    g.fillStyle(0xf5c518, 0.9)
    g.fillCircle(width - 48, 36, 18)

    // Clouds (decorative, outside roof)
    this.drawCloud(g, 48, 40, 0.75)
    this.drawCloud(g, width * 0.38, 28, 0.55)
    this.drawCloud(g, width - 110, 70, 0.45)

    // Ground band under roof
    const groundY = this.offsetY + gridH + 18
    g.fillStyle(theme.grass, 1)
    g.fillEllipse(width / 2, groundY + 20, Math.max(gridW + 120, width * 0.85), 56)
    g.fillStyle(0x000000, 0.18)
    g.fillEllipse(width / 2, groundY + 26, Math.max(gridW + 80, width * 0.7), 28)

    // Side bushes — kept clear of playable roof
    g.fillStyle(theme.grass, 1)
    g.fillEllipse(this.offsetX - 36, this.offsetY + gridH * 0.55, 34, 22)
    g.fillEllipse(this.offsetX + gridW + 36, this.offsetY + gridH * 0.6, 36, 24)
    g.fillStyle(0x5ea038, 1)
    g.fillEllipse(this.offsetX - 22, this.offsetY + gridH * 0.58, 18, 14)
    g.fillEllipse(this.offsetX + gridW + 22, this.offsetY + gridH * 0.63, 18, 12)

    // House wall strip peeking below roof
    const wallPad = 22
    g.fillStyle(COLORS.wall, 1)
    g.fillRoundedRect(
      this.offsetX - wallPad + 10,
      this.offsetY + gridH + 2,
      gridW + wallPad * 2 - 20,
      22,
      4,
    )

    // Roof deck plate with soft depth (no heavy border)
    const pad = 16
    g.fillStyle(0x000000, 0.12)
    g.fillRoundedRect(
      this.offsetX - pad + 4,
      this.offsetY - pad + 6,
      gridW + pad * 2,
      gridH + pad * 2,
      14,
    )
    g.fillStyle(theme.roofEdge, 1)
    g.fillRoundedRect(
      this.offsetX - pad,
      this.offsetY - pad,
      gridW + pad * 2,
      gridH + pad * 2,
      14,
    )
    g.fillStyle(theme.roofDeck, 1)
    g.fillRoundedRect(
      this.offsetX - pad + 3,
      this.offsetY - pad + 3,
      gridW + pad * 2 - 6,
      gridH + pad * 2 - 6,
      12,
    )

    // Top ridge / eave highlight
    g.fillStyle(theme.roofEdge, 1)
    g.fillRoundedRect(this.offsetX - pad, this.offsetY - pad - 8, gridW + pad * 2, 14, 6)
    g.fillStyle(0xe8c9a0, 0.55)
    g.fillRoundedRect(this.offsetX - pad + 6, this.offsetY - pad - 5, gridW + pad * 2 - 12, 5, 3)
  }

  private drawCloud(g: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number): void {
    g.fillStyle(COLORS.cloud, alpha)
    g.fillEllipse(x, y, 54, 20)
    g.fillEllipse(x + 18, y - 8, 28, 22)
    g.fillEllipse(x - 16, y - 4, 24, 18)
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
          this.roofGfx.fillStyle(theme.roofDeckAlt, 1)
          this.roofGfx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2)
        } else {
          const tone = (col + row) % 2 === 0 ? theme.roofDeck : theme.roofDeckAlt
          this.roofGfx.fillStyle(tone, 1)
          this.roofGfx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2)
          this.roofGfx.lineStyle(1, theme.roofEdge, 0.12)
          this.roofGfx.lineBetween(
            x + 6,
            y + this.cellSize - 8,
            x + this.cellSize - 6,
            y + this.cellSize - 8,
          )
        }

        const lineAlpha = activeGuidance ? 0.55 : 0.18
        const lineColor = activeGuidance ? COLORS.gridActive : COLORS.gridIdle
        this.roofGfx.lineStyle(1, lineColor, lineAlpha)
        this.roofGfx.strokeRect(x + 0.5, y + 0.5, this.cellSize - 1, this.cellSize - 1)
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
