/** Relative cell offsets that define a piece shape. */
export type CellOffset = Readonly<{ col: number; row: number }>

export type CellState = 'empty' | 'occupied' | 'blocked' | 'outside'

export type PieceTypeId = 'single' | 'double' | 'triple' | 'square' | 'ell'

export type PieceDefinition = Readonly<{
  id: PieceTypeId
  label: string
  cells: readonly CellOffset[]
}>

export type InventoryPiece = Readonly<{
  instanceId: string
  typeId: PieceTypeId
  rotation: 0 | 90 | 180 | 270
  /** Absolute grid origin when placed; null while in the tray. */
  origin: GridCoord | null
}>

export type GridCoord = Readonly<{ col: number; row: number }>

export type RoofCell = Readonly<{
  col: number
  row: number
  state: CellState
  occupiedBy: string | null
}>

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert'

export type ObstacleKind = 'chimney' | 'skylight' | 'vent' | 'hatch' | 'acUnit'

export type ObstacleDefinition = Readonly<{
  kind: ObstacleKind
  cells: readonly GridCoord[]
}>

export type LevelVisualTheme = Readonly<{
  sky: number
  skyDeep: number
  roofDeck: number
  roofDeckAlt: number
  roofEdge: number
  grass: number
}>

export type LevelDefinition = Readonly<{
  id: string
  number: number
  title: string
  description: string
  difficulty: Difficulty
  columns: number
  rows: number
  /** Cells marked blocked (obstacles). */
  blockedCells: readonly GridCoord[]
  /** Cells that are outside the playable roof (irregular shapes). */
  outsideCells: readonly GridCoord[]
  obstacles: readonly ObstacleDefinition[]
  inventory: readonly { typeId: PieceTypeId; count: number }[]
  finishThreshold: number
  scoring: ScoringRules
  starThresholds: StarThresholds
  visualTheme: LevelVisualTheme
  achievementId: string
  /**
   * Bump when a level's puzzle layout changes incompatibly with prior scores.
   * Progress keeps unlocks/stars; personal-best scores are version-scoped.
   */
  puzzleVersion: number
}>

export type ScoringRules = Readonly<{
  pointsPerCell: number
  completionBonus: number
  fullCoverageBonus: number
  /** Optional flat bonus awarded on completion for harder levels. */
  difficultyBonus?: number
}>

export type StarThresholds = Readonly<{
  oneStar: number
  twoStars: number
  threeStars: number
}>

export type PlacementPreview = Readonly<{
  valid: boolean
  cells: readonly GridCoord[]
}>

export type MoveRecord =
  | Readonly<{ kind: 'place'; pieceId: string; origin: GridCoord; rotation: 0 | 90 | 180 | 270 }>
  | Readonly<{ kind: 'remove'; pieceId: string; origin: GridCoord; rotation: 0 | 90 | 180 | 270 }>

export type GameMode = 'classic' | 'timeAttack'

export type LevelResult = Readonly<{
  levelId: string
  score: number
  stars: 0 | 1 | 2 | 3
  coveragePercent: number
  occupiedCells: number
  playableCells: number
  durationMs: number
  isPerfect: boolean
  completed: boolean
  achievements: readonly string[]
  mode: GameMode
  invalidAttempts: number
  hintsUsed: number
  perfectRoof: boolean
  isNewScoreBest: boolean
}>

export type TimeAttackResult = Readonly<{
  levelId: string
  durationMs: number
  previousBestMs: number | null
  isNewPersonalBest: boolean
  coveragePercent: number
}>

export type OnlineSubmissionState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'submitting' }>
  | Readonly<{
      status: 'verified'
      verifiedScore: number
      verifiedStars: number
      verifiedCoveragePercent: number
      verifiedDurationMs: number
    }>
  | Readonly<{ status: 'rejected'; message: string }>
  | Readonly<{ status: 'unable_to_connect'; message: string }>

export type PuzzleSnapshot = Readonly<{
  levelId: string
  pieces: readonly InventoryPiece[]
  selectedPieceId: string | null
  moveHistory: readonly MoveRecord[]
  startedAt: number
}>

export type ScreenId =
  | 'welcome'
  | 'howToPlay'
  | 'modeSelect'
  | 'onlineProfile'
  | 'solarChampions'
  | 'levelSelect'
  | 'gameplay'
  | 'levelComplete'
  | 'timeAttackResults'
  | 'campaignComplete'

export type SolutionPlacement = Readonly<{
  typeId: PieceTypeId
  origin: GridCoord
  rotation: 0 | 90 | 180 | 270
}>
