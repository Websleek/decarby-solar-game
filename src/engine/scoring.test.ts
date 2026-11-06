import { describe, expect, it } from 'vitest'
import { LEVEL_1_SUNNY_HOUSE, LEVEL_1_SOLUTION } from '../levels/level1'
import { applySolution } from './applySolution'
import { createPuzzleEngine } from './puzzleState'
import {
  buildLevelResult,
  calculateScore,
  calculateStars,
  canFinishDesign,
  maxScoreForLevel,
} from './scoring'

describe('scoring', () => {
  it('assigns stars from coverage thresholds', () => {
    const t = LEVEL_1_SUNNY_HOUSE.starThresholds
    expect(calculateStars(50, t, true)).toBe(0)
    expect(calculateStars(60, t, true)).toBe(1)
    expect(calculateStars(80, t, true)).toBe(2)
    expect(calculateStars(95, t, true)).toBe(3)
    expect(calculateStars(100, t, false)).toBe(0)
  })

  it('scores from final board only and caps at 5500', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    expect(engine.getCoverage()).toBe(100)
    const score = calculateScore(LEVEL_1_SUNNY_HOUSE, engine.getGrid(), true)
    expect(score).toBe(5500)
    expect(score).toBe(maxScoreForLevel(LEVEL_1_SUNNY_HOUSE))
  })

  it('does not award full-coverage bonus below 100%', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION.slice(0, 6))).toBe(true)
    expect(engine.getCoverage()).toBe(60)
    const score = calculateScore(LEVEL_1_SUNNY_HOUSE, engine.getGrid(), true)
    expect(score).toBe(24 * 100 + 500)
    expect(score).toBeLessThan(5500)
  })

  it('allows finish at 60% and marks imperfect roofs', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION.slice(0, 6))).toBe(true)
    expect(canFinishDesign(LEVEL_1_SUNNY_HOUSE, engine.getGrid())).toBe(true)
    const result = buildLevelResult(
      LEVEL_1_SUNNY_HOUSE,
      engine.getGrid(),
      12_000,
      true,
    )
    expect(result.stars).toBe(1)
    expect(result.isPerfect).toBe(false)
    expect(result.mode).toBe('classic')
    expect(result.achievements).toContain('solar-starter')
  })

  it('awards Perfect Roof when counters stay clean at full coverage', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    const result = buildLevelResult(LEVEL_1_SUNNY_HOUSE, engine.getGrid(), 9_000, true, {
      counters: { invalidAttempts: 0, hintsUsed: 0 },
      previousBestScore: 4000,
    })
    expect(result.perfectRoof).toBe(true)
    expect(result.isNewScoreBest).toBe(true)
    expect(result.achievements).toContain('perfect-roof')
  })

  it('does not award Perfect Roof after hints or invalid attempts', () => {
    const engine = createPuzzleEngine(LEVEL_1_SUNNY_HOUSE)
    expect(applySolution(engine, LEVEL_1_SOLUTION)).toBe(true)
    const withHint = buildLevelResult(LEVEL_1_SUNNY_HOUSE, engine.getGrid(), 9_000, true, {
      counters: { invalidAttempts: 0, hintsUsed: 1 },
    })
    const withInvalid = buildLevelResult(LEVEL_1_SUNNY_HOUSE, engine.getGrid(), 9_000, true, {
      counters: { invalidAttempts: 1, hintsUsed: 0 },
    })
    expect(withHint.perfectRoof).toBe(false)
    expect(withInvalid.perfectRoof).toBe(false)
  })
})
