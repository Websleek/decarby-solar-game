export type CellOffset = Readonly<{ col: number; row: number }>
export type GridCoord = Readonly<{ col: number; row: number }>
export type PieceTypeId = 'single' | 'double' | 'triple' | 'square' | 'ell'
export type Rotation = 0 | 90 | 180 | 270
export type GameMode = 'classic' | 'timeAttack'
export type CellState = 'empty' | 'occupied' | 'blocked' | 'outside'

export type VerifiableLevel = Readonly<{
  id: string
  puzzleVersion: number
  columns: number
  rows: number
  blockedCells: readonly GridCoord[]
  outsideCells: readonly GridCoord[]
  inventory: readonly { typeId: PieceTypeId; count: number }[]
  finishThreshold: number
  scoring: Readonly<{
    pointsPerCell: number
    completionBonus: number
    fullCoverageBonus: number
    difficultyBonus?: number
  }>
  starThresholds: Readonly<{
    oneStar: number
    twoStars: number
    threeStars: number
  }>
}>

export type GameAction =
  | Readonly<{ seq: number; kind: 'select'; pieceId: string; clientAtMs: number }>
  | Readonly<{
      seq: number
      kind: 'rotate'
      pieceId: string
      rotation: Rotation
      clientAtMs: number
    }>
  | Readonly<{
      seq: number
      kind: 'place'
      pieceId: string
      origin: GridCoord
      rotation: Rotation
      clientAtMs: number
    }>
  | Readonly<{
      seq: number
      kind: 'invalid_place'
      pieceId: string
      origin: GridCoord
      rotation: Rotation
      clientAtMs: number
    }>
  | Readonly<{ seq: number; kind: 'remove'; pieceId: string; clientAtMs: number }>
  | Readonly<{ seq: number; kind: 'undo'; clientAtMs: number }>
  | Readonly<{ seq: number; kind: 'complete'; clientAtMs: number }>

export type RoofCell = Readonly<{
  col: number
  row: number
  state: CellState
  occupiedBy: string | null
}>

export type InventoryPiece = Readonly<{
  instanceId: string
  typeId: PieceTypeId
  rotation: Rotation
  origin: GridCoord | null
}>

export type ReplaySuccess = Readonly<{
  ok: true
  coveragePercent: number
  occupiedCells: number
  playableCells: number
  score: number
  stars: 0 | 1 | 2 | 3
  completed: boolean
  isPerfectCoverage: boolean
}>

export type ReplayFailure = Readonly<{
  ok: false
  code:
    | 'invalid_action'
    | 'invalid_piece'
    | 'invalid_placement'
    | 'invalid_rotation'
    | 'undo_inconsistent'
    | 'incomplete'
    | 'mode_rules'
    | 'too_many_actions'
    | 'malformed_payload'
  message: string
}>

export type ReplayResult = ReplaySuccess | ReplayFailure

export const MAX_ACTIONS = 2_000
export const MAX_PAYLOAD_ACTIONS_BYTES = 512_000
export const ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000
export const MAX_OPEN_ATTEMPTS_PER_PLAYER = 1
export const MAX_ATTEMPTS_PER_HOUR = 40
/** Reject Time Attack durations faster than this floor (anti-spam / impossible). */
export const MIN_TIME_ATTACK_DURATION_MS = 1_500
/** Soft upper bound for a single attempt duration used as a sanity check. */
export const MAX_VERIFIED_DURATION_MS = 3 * 60 * 60 * 1000
