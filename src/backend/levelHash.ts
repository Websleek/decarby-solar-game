import type { LevelDefinition } from '../types/game'

/**
 * Stable configuration fingerprint for competitive level versioning.
 * Only puzzle-relevant fields are included (not visual theme titles).
 */
export function buildLevelConfigurationPayload(level: LevelDefinition): unknown {
  return {
    id: level.id,
    version: level.puzzleVersion,
    columns: level.columns,
    rows: level.rows,
    blockedCells: level.blockedCells,
    outsideCells: level.outsideCells,
    inventory: level.inventory,
    finishThreshold: level.finishThreshold,
    scoring: level.scoring,
    starThresholds: level.starThresholds,
  }
}

/** Deterministic non-crypto hash suitable for version metadata (not security-critical). */
export function hashLevelConfiguration(level: LevelDefinition): string {
  const json = JSON.stringify(buildLevelConfigurationPayload(level))
  let hash = 2166136261
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
