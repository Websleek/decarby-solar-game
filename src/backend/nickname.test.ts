import { describe, expect, it } from 'vitest'
import { normalizeNicknameKey, validateNickname } from './nickname'

describe('nickname validation', () => {
  it('accepts family-friendly names', () => {
    expect(validateNickname('SolarScout')).toEqual({ ok: true, nickname: 'SolarScout' })
    expect(validateNickname('  Roof Ace  ')).toEqual({ ok: true, nickname: 'Roof Ace' })
  })

  it('rejects length and charset issues', () => {
    expect(validateNickname('ab').ok).toBe(false)
    expect(validateNickname('a'.repeat(21)).ok).toBe(false)
    expect(validateNickname('Bad!Name').ok).toBe(false)
    expect(validateNickname('_leading').ok).toBe(false)
  })

  it('filters inappropriate names', () => {
    const result = validateNickname('badfuckname')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.toLowerCase()).toContain('family-friendly')
  })

  it('normalizes uniqueness keys', () => {
    expect(normalizeNicknameKey('Solar Scout')).toBe('solar scout')
  })
})
