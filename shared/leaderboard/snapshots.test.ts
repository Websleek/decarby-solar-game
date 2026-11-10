import { describe, expect, it } from 'vitest'
import { planSnapshotFinalise, standingsFromFinalisedSnapshot } from './snapshots.ts'

describe('leaderboard snapshots', () => {
  it('marks standings as finalised for eligibility use', () => {
    const standings = standingsFromFinalisedSnapshot('overall', [
      {
        snapshotId: 's1',
        rank: 3,
        playerId: 'p1',
        publicNickname: 'SolarFox',
        scoreMetric: 900,
        durationMetricMs: 12000,
      },
    ])
    expect(standings).toEqual([{ board: 'overall', rank: 3, finalised: true }])
  })

  it('prevents duplicate finalisation for the same fingerprint', () => {
    const again = planSnapshotFinalise({
      board: 'speed',
      periodLabel: '2026-W45-sunny-house',
      sourceFingerprint: 'speed-fp-1',
      entryCount: 5,
      existingFingerprint: 'speed-fp-1',
    })
    expect(again.kind).toBe('existing')
  })
})
