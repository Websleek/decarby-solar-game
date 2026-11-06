import type { VerifiableLevel } from './types.ts'

export function buildLevelConfigurationPayload(level: VerifiableLevel): unknown {
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

export function hashLevelConfiguration(level: VerifiableLevel): string {
  const json = JSON.stringify(buildLevelConfigurationPayload(level))
  let hash = 2166136261
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
