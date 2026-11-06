import { describe, expect, it } from 'vitest'
import {
  LEADERBOARD_LEVEL_IDS,
  findViewerRank,
  paginateRanks,
  rankOverallChampions,
  rankRooftop,
  rankSpeedChampions,
  rankWeeklyLeaders,
  type ClassicVerifiedRow,
} from './ranking'

function row(
  partial: Partial<ClassicVerifiedRow> &
    Pick<ClassicVerifiedRow, 'playerId' | 'publicNickname' | 'levelId' | 'verifiedScore'>,
): ClassicVerifiedRow {
  return {
    verifiedDurationMs: 30_000,
    verifiedAt: '2026-03-20T02:00:00.000Z',
    version: 1,
    activeVersion: 1,
    moderationStatus: 'active',
    ...partial,
  }
}

const fiveFor = (playerId: string, nickname: string, score: number): ClassicVerifiedRow[] =>
  LEADERBOARD_LEVEL_IDS.map((levelId, index) =>
    row({
      playerId,
      publicNickname: nickname,
      levelId,
      verifiedScore: score + index,
      verifiedDurationMs: 40_000 - index * 1000,
    }),
  )

describe('leaderboard ranking helpers', () => {
  it('aggregates overall score and requires all five rooftops', () => {
    const incomplete = fiveFor('p1', 'AlmostThere', 1000).slice(0, 4)
    const champion = fiveFor('p2', 'SolarAce', 2000)
    const ranked = rankOverallChampions([...incomplete, ...champion])
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.publicNickname).toBe('SolarAce')
    expect(ranked[0]?.totalScore).toBe(2000 + 2001 + 2002 + 2003 + 2004)
  })

  it('deduplicates replayed levels by keeping the highest score', () => {
    const replayLow = row({
      playerId: 'p1',
      publicNickname: 'ReplayKid',
      levelId: 'sunny-house',
      verifiedScore: 1000,
    })
    const replayHigh = row({
      playerId: 'p1',
      publicNickname: 'ReplayKid',
      levelId: 'sunny-house',
      verifiedScore: 1800,
      verifiedDurationMs: 25_000,
    })
    const rest = LEADERBOARD_LEVEL_IDS.slice(1).map((levelId) =>
      row({
        playerId: 'p1',
        publicNickname: 'ReplayKid',
        levelId,
        verifiedScore: 1500,
      }),
    )
    const ranked = rankOverallChampions([replayLow, replayHigh, ...rest])
    expect(ranked[0]?.totalScore).toBe(1800 + 1500 * 4)
  })

  it('keeps weekly leaders inside Canberra week bounds and ignores prior weeks', () => {
    const weekStart = '2026-03-16T13:00:00.000Z'
    const weekEnd = '2026-03-23T13:00:00.000Z'
    const inside = row({
      playerId: 'p1',
      publicNickname: 'ThisWeek',
      levelId: 'sunny-house',
      verifiedScore: 2200,
      verifiedAt: '2026-03-18T01:00:00.000Z',
    })
    const outside = row({
      playerId: 'p2',
      publicNickname: 'LastWeek',
      levelId: 'sunny-house',
      verifiedScore: 9000,
      verifiedAt: '2026-03-15T12:00:00.000Z',
    })
    const ranked = rankWeeklyLeaders([inside, outside], weekStart, weekEnd)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.publicNickname).toBe('ThisWeek')
  })

  it('breaks rooftop ties by shorter duration then earlier verification', () => {
    const a = row({
      playerId: 'p1',
      publicNickname: 'Ada',
      levelId: 'sunny-house',
      verifiedScore: 3000,
      verifiedDurationMs: 20_000,
      verifiedAt: '2026-03-20T03:00:00.000Z',
    })
    const b = row({
      playerId: 'p2',
      publicNickname: 'Bea',
      levelId: 'sunny-house',
      verifiedScore: 3000,
      verifiedDurationMs: 18_000,
      verifiedAt: '2026-03-20T04:00:00.000Z',
    })
    const ranked = rankRooftop([a, b], 'sunny-house')
    expect(ranked.map((entry) => entry.publicNickname)).toEqual(['Bea', 'Ada'])
  })

  it('filters per-level rooftop rankings', () => {
    const sunny = row({
      playerId: 'p1',
      publicNickname: 'Sun',
      levelId: 'sunny-house',
      verifiedScore: 1000,
    })
    const chimney = row({
      playerId: 'p2',
      publicNickname: 'Chimney',
      levelId: 'chimney-challenge',
      verifiedScore: 5000,
    })
    expect(rankRooftop([sunny, chimney], 'sunny-house')).toHaveLength(1)
    expect(rankRooftop([sunny, chimney], 'sunny-house')[0]?.publicNickname).toBe('Sun')
  })

  it('ranks Speed Champions by shortest duration and ignores inactive versions', () => {
    const fastOld = row({
      playerId: 'p1',
      publicNickname: 'OldFast',
      levelId: 'sunny-house',
      verifiedScore: 0,
      verifiedDurationMs: 8_000,
      version: 1,
      activeVersion: 2,
    })
    const slowerActive = row({
      playerId: 'p2',
      publicNickname: 'NewSteady',
      levelId: 'sunny-house',
      verifiedScore: 0,
      verifiedDurationMs: 12_000,
      version: 2,
      activeVersion: 2,
    })
    const ranked = rankSpeedChampions([fastOld, slowerActive], 'sunny-house')
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.publicNickname).toBe('NewSteady')
  })

  it('excludes moderated profiles from live boards', () => {
    const blocked = row({
      playerId: 'p1',
      publicNickname: 'Blocked',
      levelId: 'sunny-house',
      verifiedScore: 9999,
      moderationStatus: 'restricted',
    })
    const ok = row({
      playerId: 'p2',
      publicNickname: 'Friendly',
      levelId: 'sunny-house',
      verifiedScore: 100,
    })
    expect(rankRooftop([blocked, ok], 'sunny-house')[0]?.publicNickname).toBe('Friendly')
  })

  it('paginates by rank offset and finds viewer standing', () => {
    const entries = [
      { rank: 1, publicNickname: 'A', verifiedScore: 3, verifiedDurationMs: 1 },
      { rank: 2, publicNickname: 'B', verifiedScore: 2, verifiedDurationMs: 1 },
      { rank: 3, publicNickname: 'C', verifiedScore: 1, verifiedDurationMs: 1 },
    ]
    expect(paginateRanks(entries, 1, 1)).toEqual([entries[1]])
    expect(findViewerRank(entries, 'C')).toBe(3)
    expect(findViewerRank(entries, null)).toBeNull()
  })

  it('returns empty boards cleanly', () => {
    expect(rankOverallChampions([])).toEqual([])
    expect(rankWeeklyLeaders([], '2026-03-16T13:00:00.000Z', '2026-03-23T13:00:00.000Z')).toEqual(
      [],
    )
    expect(rankRooftop([], 'sunny-house')).toEqual([])
    expect(rankSpeedChampions([], 'sunny-house')).toEqual([])
  })
})
