/**
 * Immutable finalised leaderboard snapshot types for promotional eligibility.
 * Live ranks are not promotional-eligible unless captured in a finalised snapshot.
 */

export const SNAPSHOT_BOARDS = ['overall', 'speed'] as const
export type SnapshotBoard = (typeof SNAPSHOT_BOARDS)[number]

export type LeaderboardSnapshotMeta = Readonly<{
  id: string
  board: SnapshotBoard
  levelId: string | null
  periodLabel: string
  periodStart: string | null
  periodEnd: string | null
  finalisedAt: string
  sourceFingerprint: string
  entryCount: number
}>

export type LeaderboardSnapshotEntry = Readonly<{
  snapshotId: string
  rank: number
  playerId: string
  publicNickname: string
  scoreMetric: number
  durationMetricMs: number | null
}>

export type SnapshotFinaliseInput = Readonly<{
  board: SnapshotBoard
  levelId?: string | null
  periodLabel: string
  periodStart?: string | null
  periodEnd?: string | null
  entries: readonly Readonly<{
    rank: number
    playerId: string
    publicNickname: string
    scoreMetric: number
    durationMetricMs?: number | null
  }>[]
  sourceFingerprint: string
}>

export type SnapshotFinalisePlan =
  | Readonly<{ kind: 'create'; fingerprint: string; entryCount: number }>
  | Readonly<{ kind: 'existing'; fingerprint: string; reason: string }>
  | Readonly<{ kind: 'rejected'; code: string; reason: string }>

export function planSnapshotFinalise(input: {
  board: string
  periodLabel: string
  sourceFingerprint: string
  entryCount: number
  existingFingerprint: string | null
}): SnapshotFinalisePlan {
  if (input.board !== 'overall' && input.board !== 'speed') {
    return { kind: 'rejected', code: 'unsupported_board', reason: 'Unsupported snapshot board.' }
  }
  if (!input.periodLabel || input.periodLabel.trim().length < 3) {
    return { kind: 'rejected', code: 'invalid_period', reason: 'periodLabel is required.' }
  }
  if (!input.sourceFingerprint || input.sourceFingerprint.length < 8) {
    return {
      kind: 'rejected',
      code: 'invalid_fingerprint',
      reason: 'sourceFingerprint is required for idempotent finalisation.',
    }
  }
  if (input.entryCount < 0) {
    return { kind: 'rejected', code: 'invalid_entries', reason: 'entryCount cannot be negative.' }
  }
  if (input.existingFingerprint === input.sourceFingerprint) {
    return {
      kind: 'existing',
      fingerprint: input.sourceFingerprint,
      reason: 'Snapshot already finalised for this fingerprint.',
    }
  }
  return {
    kind: 'create',
    fingerprint: input.sourceFingerprint,
    entryCount: input.entryCount,
  }
}

/** Build eligibility standings from a finalised snapshot (never from live ranks). */
export function standingsFromFinalisedSnapshot(
  board: SnapshotBoard,
  entries: readonly LeaderboardSnapshotEntry[],
): readonly Readonly<{ board: SnapshotBoard; rank: number; finalised: true }>[] {
  return entries.map((entry) => ({
    board,
    rank: entry.rank,
    finalised: true as const,
  }))
}
