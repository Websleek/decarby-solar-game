import { getFirstLevel, getLevelById, getNextLevel, listLocalLevels } from '../levels'
import type { GameMode, LevelDefinition, LevelResult, TimeAttackResult } from '../types/game'
import type { PlayerProgress, ProgressService } from '../types/services'

const STORAGE_KEY = 'decarby-solar-progress'
const SCHEMA_VERSION = 4

type StoredProgress = {
  version: number
  data: PlayerProgress
}

const FIRST_LEVEL_ID = getFirstLevel().id

function emptyProgress(): PlayerProgress {
  return {
    completedLevels: [],
    unlockedLevels: [FIRST_LEVEL_ID],
    bestScores: {},
    scorePuzzleVersions: {},
    legacyBestScores: {},
    bestStars: {},
    bestDurations: {},
    timeAttackBestMs: {},
    perfectRoofLevels: [],
    preferredGameMode: null,
    selectedLevelId: FIRST_LEVEL_ID,
    soundEnabled: true,
    tutorialCompleted: false,
    achievements: [],
  }
}

const DEFAULT_PROGRESS = emptyProgress()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

function sanitizeScores(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (!isRecord(value)) return result
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      result[key] = entry
    }
  }
  return result
}

function sanitizeStars(value: unknown): Record<string, 0 | 1 | 2 | 3> {
  const result: Record<string, 0 | 1 | 2 | 3> = {}
  if (!isRecord(value)) return result
  for (const [key, entry] of Object.entries(value)) {
    if (entry === 0 || entry === 1 || entry === 2 || entry === 3) {
      result[key] = entry
    }
  }
  return result
}

function sanitizeVersions(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (!isRecord(value)) return result
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0) {
      result[key] = entry
    }
  }
  return result
}

export function reconcileScoreVersions(progress: PlayerProgress): PlayerProgress {
  const bestScores = { ...progress.bestScores }
  const scorePuzzleVersions = { ...progress.scorePuzzleVersions }
  const legacyBestScores = { ...progress.legacyBestScores }

  for (const level of listLocalLevels()) {
    const storedVersion = scorePuzzleVersions[level.id]
    const currentScore = bestScores[level.id]
    if (currentScore === undefined) continue

    const effectiveVersion = storedVersion ?? 1
    if (effectiveVersion < level.puzzleVersion) {
      legacyBestScores[level.id] = Math.max(legacyBestScores[level.id] ?? 0, currentScore)
      delete bestScores[level.id]
      delete scorePuzzleVersions[level.id]
    } else if (storedVersion === undefined) {
      scorePuzzleVersions[level.id] = level.puzzleVersion
    }
  }

  return { ...progress, bestScores, scorePuzzleVersions, legacyBestScores }
}

export function deriveUnlockedLevels(
  completedLevels: readonly string[],
  bestStars: Readonly<Record<string, 0 | 1 | 2 | 3>>,
  explicitUnlocked?: readonly string[],
): string[] {
  const unlocked = new Set<string>([FIRST_LEVEL_ID, ...(explicitUnlocked ?? [])])

  for (const level of listLocalLevels()) {
    if ((bestStars[level.id] ?? 0) >= 1 || completedLevels.includes(level.id)) {
      unlocked.add(level.id)
      const next = getNextLevel(level.id)
      if (next && (bestStars[level.id] ?? 0) >= 1) unlocked.add(next.id)
    }
  }

  for (const id of completedLevels) {
    unlocked.add(id)
    if ((bestStars[id] ?? 1) >= 1) {
      const next = getNextLevel(id)
      if (next) unlocked.add(next.id)
    }
  }

  return listLocalLevels()
    .map((level) => level.id)
    .filter((id) => unlocked.has(id))
}

export function isLevelUnlocked(progress: PlayerProgress, levelId: string): boolean {
  return progress.unlockedLevels.includes(levelId)
}

export function isTimeAttackLevelAvailable(progress: PlayerProgress, levelId: string): boolean {
  return progress.completedLevels.includes(levelId)
}

export type LevelScoreDisplay = {
  currentBest: number | null
  legacyBest: number | null
  isCurrentVersion: boolean
}

export function getLevelScoreDisplay(
  progress: PlayerProgress,
  level: LevelDefinition,
): LevelScoreDisplay {
  const version = progress.scorePuzzleVersions[level.id] ?? null
  const currentBest = progress.bestScores[level.id]
  const legacyBest = progress.legacyBestScores[level.id] ?? null

  if (typeof currentBest === 'number' && version === level.puzzleVersion) {
    return { currentBest, legacyBest, isCurrentVersion: true }
  }

  if (typeof currentBest === 'number' && (version ?? 1) < level.puzzleVersion) {
    return {
      currentBest: null,
      legacyBest: Math.max(legacyBest ?? 0, currentBest),
      isCurrentVersion: false,
    }
  }

  return {
    currentBest: typeof currentBest === 'number' ? currentBest : null,
    legacyBest,
    isCurrentVersion: typeof currentBest === 'number',
  }
}

function sanitizeProgress(raw: unknown): PlayerProgress {
  if (!isRecord(raw)) return emptyProgress()

  const completedLevels = sanitizeStringArray(raw.completedLevels)
  const bestScores = sanitizeScores(raw.bestScores)
  const bestStars = sanitizeStars(raw.bestStars)
  const bestDurations = sanitizeScores(raw.bestDurations)
  const scorePuzzleVersions = sanitizeVersions(raw.scorePuzzleVersions)
  const legacyBestScores = sanitizeScores(raw.legacyBestScores)
  const timeAttackBestMs = sanitizeScores(raw.timeAttackBestMs)
  const perfectRoofLevels = sanitizeStringArray(raw.perfectRoofLevels)
  const explicitUnlocked = sanitizeStringArray(raw.unlockedLevels)
  const unlockedLevels = deriveUnlockedLevels(completedLevels, bestStars, explicitUnlocked)
  const achievements = sanitizeStringArray(raw.achievements)
  const preferredGameMode =
    raw.preferredGameMode === 'classic' || raw.preferredGameMode === 'timeAttack'
      ? raw.preferredGameMode
      : null

  const selectedLevelId =
    typeof raw.selectedLevelId === 'string' && unlockedLevels.includes(raw.selectedLevelId)
      ? raw.selectedLevelId
      : unlockedLevels[unlockedLevels.length - 1] ?? FIRST_LEVEL_ID

  return reconcileScoreVersions({
    completedLevels,
    unlockedLevels,
    bestScores,
    scorePuzzleVersions,
    legacyBestScores,
    bestStars,
    bestDurations,
    timeAttackBestMs,
    perfectRoofLevels,
    preferredGameMode,
    selectedLevelId,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : true,
    tutorialCompleted:
      typeof raw.tutorialCompleted === 'boolean' ? raw.tutorialCompleted : false,
    achievements,
  })
}

function migrate(parsed: Record<string, unknown>): PlayerProgress {
  if (
    (parsed.version === SCHEMA_VERSION ||
      parsed.version === 3 ||
      parsed.version === 2 ||
      parsed.version === 1) &&
    'data' in parsed
  ) {
    return sanitizeProgress(parsed.data)
  }
  return sanitizeProgress(parsed)
}

function readStorage(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyProgress()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return emptyProgress()
    return migrate(parsed)
  } catch {
    return emptyProgress()
  }
}

function writeStorage(progress: PlayerProgress): void {
  const payload: StoredProgress = { version: SCHEMA_VERSION, data: progress }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export const localProgressService: ProgressService = {
  async load() {
    return readStorage()
  },

  async save(progress) {
    writeStorage(progress)
  },

  async recordLevelResult(result: LevelResult) {
    const current = readStorage()
    if (!result.completed || result.mode !== 'classic') return current

    const level = getLevelById(result.levelId)
    const puzzleVersion = level?.puzzleVersion ?? 1

    const completedLevels = current.completedLevels.includes(result.levelId)
      ? current.completedLevels
      : [...current.completedLevels, result.levelId]

    let bestScores = { ...current.bestScores }
    let scorePuzzleVersions = { ...current.scorePuzzleVersions }
    let legacyBestScores = { ...current.legacyBestScores }

    const existingVersion =
      scorePuzzleVersions[result.levelId] ??
      (bestScores[result.levelId] !== undefined ? 1 : null)
    if (
      existingVersion !== null &&
      existingVersion < puzzleVersion &&
      bestScores[result.levelId] !== undefined
    ) {
      legacyBestScores[result.levelId] = Math.max(
        legacyBestScores[result.levelId] ?? 0,
        bestScores[result.levelId]!,
      )
      delete bestScores[result.levelId]
      delete scorePuzzleVersions[result.levelId]
    }

    const previousBest =
      scorePuzzleVersions[result.levelId] === puzzleVersion
        ? (bestScores[result.levelId] ?? 0)
        : 0
    bestScores = {
      ...bestScores,
      [result.levelId]: Math.max(previousBest, result.score),
    }
    scorePuzzleVersions = {
      ...scorePuzzleVersions,
      [result.levelId]: puzzleVersion,
    }

    const previousStars = current.bestStars[result.levelId] ?? 0
    const bestStars = {
      ...current.bestStars,
      [result.levelId]: Math.max(previousStars, result.stars) as 0 | 1 | 2 | 3,
    }

    const previousDuration = current.bestDurations[result.levelId]
    const bestDurations = { ...current.bestDurations }
    if (previousDuration === undefined || result.durationMs < previousDuration) {
      bestDurations[result.levelId] = result.durationMs
    }

    const perfectRoofLevels = result.perfectRoof
      ? current.perfectRoofLevels.includes(result.levelId)
        ? current.perfectRoofLevels
        : [...current.perfectRoofLevels, result.levelId]
      : current.perfectRoofLevels

    const achievements = [...current.achievements]
    for (const id of result.achievements) {
      if (!achievements.includes(id)) achievements.push(id)
    }

    const unlockedLevels = deriveUnlockedLevels(completedLevels, bestStars, current.unlockedLevels)

    const next: PlayerProgress = {
      ...current,
      completedLevels,
      unlockedLevels,
      bestScores,
      scorePuzzleVersions,
      legacyBestScores,
      bestStars,
      bestDurations,
      perfectRoofLevels,
      achievements,
      selectedLevelId: result.levelId,
    }
    writeStorage(next)
    return next
  },

  async recordTimeAttackResult(result: TimeAttackResult) {
    const current = readStorage()
    if (result.coveragePercent < 100) return current
    if (!current.completedLevels.includes(result.levelId)) return current

    const previous = current.timeAttackBestMs[result.levelId]
    const isBetter = previous === undefined || result.durationMs < previous
    if (!isBetter) return current

    const next: PlayerProgress = {
      ...current,
      timeAttackBestMs: {
        ...current.timeAttackBestMs,
        [result.levelId]: result.durationMs,
      },
    }
    writeStorage(next)
    return next
  },

  async setSoundEnabled(enabled) {
    const next = { ...readStorage(), soundEnabled: enabled }
    writeStorage(next)
    return next
  },

  async setTutorialCompleted(completed) {
    const next = { ...readStorage(), tutorialCompleted: completed }
    writeStorage(next)
    return next
  },

  async setSelectedLevel(levelId) {
    const current = readStorage()
    if (!current.unlockedLevels.includes(levelId)) return current
    const next = { ...current, selectedLevelId: levelId }
    writeStorage(next)
    return next
  },

  async setPreferredGameMode(mode: GameMode) {
    const next = { ...readStorage(), preferredGameMode: mode }
    writeStorage(next)
    return next
  },
}

export const ACHIEVEMENTS = {
  'solar-starter': {
    id: 'solar-starter',
    title: 'Solar Starter',
    description: 'Complete Sunny House.',
  },
  'roof-rookie': {
    id: 'roof-rookie',
    title: 'Roof Rookie',
    description: 'Complete Chimney Challenge.',
  },
  'solar-designer': {
    id: 'solar-designer',
    title: 'Solar Designer',
    description: 'Complete Tricky Rooftop.',
  },
  'solar-puzzle-master': {
    id: 'solar-puzzle-master',
    title: 'Solar Puzzle Master',
    description: 'Complete Solar Puzzle Master.',
  },
  'decarby-solar-champion': {
    id: 'decarby-solar-champion',
    title: 'Decarby Solar Champion',
    description: 'Complete the final rooftop challenge.',
  },
  'perfect-roof': {
    id: 'perfect-roof',
    title: 'Perfect Roof',
    description: 'Finish a rooftop with no invalid moves and no hints.',
  },
} as const

export type AchievementId = keyof typeof ACHIEVEMENTS

export { DEFAULT_PROGRESS }
