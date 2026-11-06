import { describe, expect, it } from 'vitest'
import { getRotatedCells, nextRotation, normalizeCells, rotateOffset } from './pieces'

describe('piece rotation', () => {
  it('rotates a cell 90 degrees clockwise', () => {
    expect(rotateOffset({ col: 1, row: 0 }, 90)).toEqual({ col: 0, row: 1 })
    expect(rotateOffset({ col: 0, row: 1 }, 90)).toEqual({ col: -1, row: 0 })
  })

  it('normalizes rotated cells to origin', () => {
    expect(normalizeCells([{ col: -1, row: 0 }, { col: 0, row: 0 }])).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ])
  })

  it('rotates a double panel through 360 degrees', () => {
    expect(getRotatedCells('double', 0)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ])
    expect(getRotatedCells('double', 90)).toEqual([
      { col: 0, row: 0 },
      { col: 0, row: 1 },
    ])
    expect(getRotatedCells('double', 180)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ])
  })

  it('keeps a square group identical under rotation', () => {
    expect(getRotatedCells('square', 90)).toEqual(getRotatedCells('square', 0))
  })

  it('cycles rotation in 90-degree steps', () => {
    expect(nextRotation(0)).toBe(90)
    expect(nextRotation(270)).toBe(0)
  })
})
